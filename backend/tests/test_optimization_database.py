"""Goal-search contract and financial checks on disposable PostgreSQL.

Expected amounts are hand calculated from the shared mixed-VAT/refund fixture:
net merchandise 225, shipping revenue 10, baseline operating profit 70.
"""

from decimal import Decimal
import json
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session

from app.db import session as database_session
from app.db.base import Base
from app.db.demo import DEMO_PERIOD_END, DEMO_PERIOD_START, DEMO_STORE_ID
from app.db.models import DailyTraffic, Expense
from app.main import create_app
from app.seed import seed_database
from app.services.financial_reporting import FinanceService

from test_finance_database import DAY, add_refund, add_sale, finance_case, finance_client, finance_store
from test_simulation_database import business_fingerprint

D = Decimal
ENDPOINT = "/api/optimization/goal"


def goal_body(*, target="10", constraints=None, assumptions=None, search=None, start=DAY, end=DAY):
    return {
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "target_profit_increase_pct": target,
        "constraints": {
            "min_selling_price_change_pct": "0", "max_selling_price_change_pct": "10",
            "max_discount_pct": "0", "max_advertising_increase_amount": "0.00",
            "max_additional_operating_expense_amount": "0.00",
            "minimum_operating_profit_margin_pct": None,
            **(constraints or {}),
        },
        "behavioral_assumptions": {
            "conversion_mode": "historical", "expected_conversion_rate": None,
            "visitor_change_pct": "0", "unit_cost_change_pct": "0", **(assumptions or {}),
        },
        "search": {
            "price_points": 5, "discount_points": 3, "advertising_points": 2,
            "expense_points": 2, "max_candidates": 625, **(search or {}),
        },
    }


def optimize(client, body=None):
    response = client.post(ENDPOINT, json=body or goal_body())
    assert response.status_code == 200, response.text
    return response.json()


def test_achievable_goal_has_independent_decimal_target_ranked_top_three(finance_client, finance_case, db_session):
    result = optimize(finance_client)
    assert result["status"] == "feasible"
    assert result["store_id"] == str(DEMO_STORE_ID) and result["currency"] == "USD"
    assert result["baseline"] == FinanceService(db_session).get_summary(DAY, DAY).model_dump(mode="json")
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", result["snapshot_id"])
    assert result["target_operating_profit"] == "77.00"
    assert result["target_profit_difference"] == "7.00"
    assert result["candidates_evaluated"] == 5 and result["feasible_candidate_count"] == 3
    rows = result["recommendations"]
    assert [row["simulated"]["operating_profit"] for row in rows] == ["92.50", "86.88", "81.25"]
    assert [row["simulated"]["revenue"] for row in rows] == ["257.50", "251.88", "246.25"]
    assert [row["differences"]["operating_profit"] for row in rows] == ["22.50", "16.88", "11.25"]
    assert len({row["id"] for row in rows}) == 3
    assert result["assumptions"] and isinstance(result["warnings"], list)
    assert all(row["constraints_satisfied"] for row in rows)


def test_unachievable_target_does_not_invent_conversion_or_favorable_result(finance_client, finance_case):
    result = optimize(finance_client, goal_body(target="100"))
    assert result["status"] == "target_not_achievable"
    assert result["target_operating_profit"] == "140.00"
    assert result["feasible_candidate_count"] == 0 and result["recommendations"] == []
    assert result["candidates_evaluated"] == 5
    assert result["warnings"]


def test_minimum_margin_filters_otherwise_profitable_candidates(finance_client, finance_case):
    result = optimize(finance_client, goal_body(constraints={"minimum_operating_profit_margin_pct": "35"}))
    assert result["status"] == "feasible" and result["feasible_candidate_count"] == 1
    assert len(result["recommendations"]) == 1
    assert result["recommendations"][0]["simulated"]["operating_profit_margin"] == "35.92"
    assert result["rejections"] == {"below_profit_target": 2, "below_minimum_margin": 2, "unavailable": 0}
    assert sum(result["rejections"].values()) + result["feasible_candidate_count"] == result["candidates_evaluated"]
    impossible = optimize(finance_client, goal_body(constraints={"minimum_operating_profit_margin_pct": "99"}))
    assert impossible["status"] == "target_not_achievable" and impossible["recommendations"] == []


@pytest.mark.parametrize(("price", "expected_status"), [("0.0044", "feasible"), ("0.0020", "target_not_achievable")])
def test_fractional_cent_target_is_rounded_up_to_an_achievable_cent(finance_client, finance_case, price, expected_status):
    result = optimize(finance_client, goal_body(target="0.01", constraints={
        "min_selling_price_change_pct": price, "max_selling_price_change_pct": price,
    }))
    # 70 * 1.0001 = 70.007; reporting 70.00 would silently miss the target.
    assert result["target_operating_profit"] == "70.01"
    assert result["target_profit_difference"] == "0.01"
    assert result["candidates_evaluated"] == 1
    assert result["status"] == expected_status


def test_every_recommendation_obeys_constraints_and_exactly_reuses_preview(finance_client, finance_case):
    body = goal_body(target="0", constraints={
        "min_selling_price_change_pct": "-5", "max_selling_price_change_pct": "10",
        "max_discount_pct": "5", "max_advertising_increase_amount": "2.00",
        "max_additional_operating_expense_amount": "3.00",
    }, assumptions={"conversion_mode": "explicit", "expected_conversion_rate": "3",
                    "visitor_change_pct": "10", "unit_cost_change_pct": "2"})
    result = optimize(finance_client, body)
    assert result["status"] == "feasible"
    for row in result["recommendations"]:
        params = row["parameters"]
        assert D("-5") <= D(params["selling_price_change_pct"]) <= D("10")
        assert 0 <= D(params["discount_pct"]) <= 5
        assert 0 <= D(params["advertising_budget_change_amount"]) <= 2
        assert 0 <= D(params["additional_operating_expense_amount"]) <= 3
        assert D(params["expected_conversion_rate"]) == 3
        assert D(params["visitor_change_pct"]) == 10 and D(params["unit_cost_change_pct"]) == 2
        assert D(row["simulated"]["expected_orders"]) == D("3.3")
        response = finance_client.post("/api/simulations/preview", json={
            "start_date": body["start_date"], "end_date": body["end_date"], "parameters": params,
        })
        assert response.status_code == 200
        preview = response.json()
        assert row["simulated"] == preview["simulated"]
        assert row["differences"] == preview["differences"]


def test_single_baseline_and_constant_query_count_for_maximum_grid(finance_client, finance_case, db_session, monkeypatch):
    from app.services import optimization

    loads, received, received_parameters, statements = [], [], [], []
    original_summary, original_simulate = FinanceService.get_summary, optimization.simulate

    def record_summary(service, *args, **kwargs):
        baseline = original_summary(service, *args, **kwargs)
        loads.append(baseline)
        return baseline

    def record_simulate(baseline, parameters):
        received.append(baseline)
        received_parameters.append(parameters)
        return original_simulate(baseline, parameters)

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split(None, 1)[0].upper())

    monkeypatch.setattr(FinanceService, "get_summary", record_summary)
    monkeypatch.setattr(optimization, "simulate", record_simulate)
    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        first = optimize(finance_client)
        first_count = len(statements)
        assert len(loads) == 1 and len(received) >= 5
        assert all(baseline is loads[0] for baseline in received)
        received.clear()
        received_parameters.clear()
        statements.clear()
        second = optimize(finance_client, goal_body(target="0", constraints={
            "max_selling_price_change_pct": "20", "max_discount_pct": "10",
            "max_advertising_increase_amount": "20", "max_additional_operating_expense_amount": "20",
        }, search={"price_points": 5, "discount_points": 5, "advertising_points": 5, "expense_points": 5}))
        assert second["candidates_evaluated"] == 625
        assert len(loads) == 2 and len(received) >= 625
        assert all(baseline is loads[1] for baseline in received)
        assert {params.selling_price_change_pct for params in received_parameters} == {D(value) for value in (0, 5, 10, 15, 20)}
        assert {params.discount_pct for params in received_parameters} == {D(value) for value in ("0", "2.5", "5", "7.5", "10")}
        assert {params.advertising_budget_change_amount for params in received_parameters} == {D(value) for value in (0, 5, 10, 15, 20)}
        assert {params.additional_operating_expense_amount for params in received_parameters} == {D(value) for value in (0, 5, 10, 15, 20)}
        assert all(params.expected_conversion_rate is None and params.visitor_change_pct == 0 for params in received_parameters)
        assert len(statements) == first_count and first_count > 0
        assert set(statements) == {"SELECT"}
        assert first["snapshot_id"] == second["snapshot_id"]
    finally:
        event.remove(connection, "before_cursor_execute", capture)


def test_equal_score_ties_and_ids_are_deterministic_and_decisions_distinct(finance_client, finance_case, db_session):
    # A tiny four-place price interval rounds all candidates to the same money.
    body = goal_body(target="0", constraints={"max_selling_price_change_pct": "0.0004"})
    before = business_fingerprint(db_session)
    first = optimize(finance_client, body)
    assert optimize(finance_client, body) == first
    rows = first["recommendations"]
    assert len(rows) == 3 and len({row["id"] for row in rows}) == 3
    assert len({json.dumps(row["parameters"], sort_keys=True) for row in rows}) == 3
    assert {row["simulated"]["operating_profit"] for row in rows} == {"70.00"}
    assert business_fingerprint(db_session) == before


def test_actual_deduplicated_grid_is_capped_and_includes_both_currency_endpoints(finance_client, finance_case):
    body = goal_body(target="0", constraints={
        "max_selling_price_change_pct": "0", "max_advertising_increase_amount": "0.01",
        "max_additional_operating_expense_amount": "0.01",
    }, search={"discount_points": 5, "advertising_points": 5, "expense_points": 5, "max_candidates": 4})
    result = optimize(finance_client, body)
    assert result["candidates_evaluated"] == 4
    assert result["feasible_candidate_count"] == 1
    assert result["rejections"]["below_profit_target"] == 3
    body["search"]["max_candidates"] = 3
    rejected = finance_client.post(ENDPOINT, json=body)
    assert rejected.status_code == 422
    assert "4 distinct candidates" in rejected.json()["message"]


def test_unsupported_historical_conversion_is_disclosed_for_every_candidate(finance_client, finance_case, db_session):
    traffic = db_session.scalar(select(DailyTraffic).where(DailyTraffic.store_id == DEMO_STORE_ID))
    traffic.visitors = 1
    db_session.flush()
    result = optimize(finance_client)
    assert result["status"] == "unavailable" and result["recommendations"] == []
    assert result["candidates_evaluated"] == result["rejections"]["unavailable"] == 5
    assert result["feasible_candidate_count"] == 0 and result["warnings"]
    explicit = optimize(finance_client, goal_body(assumptions={
        "conversion_mode": "explicit", "expected_conversion_rate": "100",
    }))
    assert explicit["status"] == "target_not_achievable"
    assert explicit["rejections"]["unavailable"] == 0


@pytest.mark.parametrize("extra_cost", ["70", "80"])
def test_zero_or_negative_baseline_profit_has_no_fabricated_percentage_goal(finance_client, finance_case, db_session, extra_cost):
    db_session.add(Expense(store_id=DEMO_STORE_ID, category="rent", amount=D(extra_cost), expense_date=DAY,
                           description="Nonpositive goal denominator"))
    db_session.flush()
    result = optimize(finance_client)
    assert result["status"] == "unavailable"
    assert result["target_operating_profit"] is None and result["target_profit_difference"] is None
    assert result["recommendations"] == [] and result["candidates_evaluated"] == 0
    assert result["warnings"]


@pytest.mark.parametrize("missing", ["vat", "traffic"])
def test_missing_baseline_is_explicitly_unavailable(finance_client, finance_case, db_session, missing):
    if missing == "vat":
        finance_case.item_a.price_includes_vat = None
    else:
        db_session.execute(delete(DailyTraffic).where(DailyTraffic.store_id == DEMO_STORE_ID))
    db_session.flush()
    result = optimize(finance_client)
    assert result["status"] == "unavailable"
    assert result["recommendations"] == [] and result["warnings"]
    assert result["baseline"]["data_completeness"]["is_complete"] is False


@pytest.mark.parametrize("flag", ["organization", "store"])
def test_both_demo_flags_remain_required(finance_client, finance_case, db_session, flag):
    getattr(finance_case, flag).is_demo = False
    db_session.flush()
    response = finance_client.post(ENDPOINT, json=goal_body())
    assert response.status_code == 404 and response.json()["code"] == "demo_store_not_seeded"


@pytest.mark.parametrize(("section", "key", "value"), [
    (None, "target_profit_increase_pct", -1), (None, "target_profit_increase_pct", 0.1),
    (None, "target_profit_increase_pct", "NaN"), (None, "store_id", "other"),
    ("constraints", "min_selling_price_change_pct", "11"),
    ("constraints", "max_discount_pct", "100.0001"),
    ("constraints", "max_advertising_increase_amount", "-0.01"),
    ("constraints", "max_additional_operating_expense_amount", "0.001"),
    ("constraints", "minimum_operating_profit_margin_pct", "100.01"),
    ("behavioral_assumptions", "conversion_mode", "automatic"),
    ("behavioral_assumptions", "conversion_mode", "explicit"),
    ("behavioral_assumptions", "expected_conversion_rate", "3"),
    ("behavioral_assumptions", "visitor_change_pct", "Infinity"),
    ("search", "price_points", 6), ("search", "price_points", True),
    ("search", "discount_points", 1), ("search", "max_candidates", 626),
    ("search", "max_candidates", 1),
])
def test_invalid_or_contradictory_parameters_return_informative_safe_422(section, key, value):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    body = goal_body()
    (body if section is None else body[section])[key] = value
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(ENDPOINT, json=body)
    assert response.status_code == 422, response.text
    assert response.json().get("detail") or response.json().get("message")


def test_period_scope_and_missing_behavior_mode_are_rejected_before_database():
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    with TestClient(application, raise_server_exceptions=False) as client:
        assert client.post(ENDPOINT + "?store_id=other", json=goal_body()).status_code == 422
        body = goal_body()
        body["start_date"] = "2025-01-01"
        assert client.post(ENDPOINT, json=body).status_code == 422
        body = goal_body()
        del body["behavioral_assumptions"]
        assert client.post(ENDPOINT, json=body).status_code == 422


def test_optimizer_uses_real_read_only_repeatable_read_transaction(postgres_engine, monkeypatch):
    assert re.fullmatch(r"rdl_test_[0-9a-f]{32}", postgres_engine.url.database)
    with Session(postgres_engine) as session, session.begin():
        assert all(session.scalar(select(table.c.id).limit(1)) is None for table in Base.metadata.sorted_tables)
        seed_database(session)
    with Session(postgres_engine) as session:
        before = business_fingerprint(session)
    states, statements = [], []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split(None, 1)[0].upper())
        if statement.startswith("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"):
            cursor.execute("SHOW transaction_read_only")
            read_only = cursor.fetchone()[0]
            cursor.execute("SHOW transaction_isolation")
            states.append((read_only, cursor.fetchone()[0]))

    monkeypatch.setattr(database_session, "get_engine", lambda: postgres_engine)
    event.listen(postgres_engine, "after_cursor_execute", capture)
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as client:
            result = optimize(client, goal_body(start=DEMO_PERIOD_START, end=DEMO_PERIOD_END))
        assert result["baseline"]["revenue"] == "29371.63"
        assert states == [("on", "repeatable read")]
        assert statements and set(statements) <= {"SET", "SELECT"}
        with Session(postgres_engine) as session:
            assert business_fingerprint(session) == before
    finally:
        event.remove(postgres_engine, "after_cursor_execute", capture)
        with postgres_engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(delete(table))
