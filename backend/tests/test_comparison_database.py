"""Focused comparison contract and consistency checks on disposable PostgreSQL.

The mixed-VAT/refund fixture and hand-calculated amounts are shared with finance
tests. All fixtures roll back, and the dependency check seeds only the temporary
UUID database allocated by conftest.
"""

from decimal import Decimal
import json
import re
from uuid import uuid4

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

from test_finance_database import (
    DAY, add_refund, add_sale, finance_case, finance_client, finance_store,
)
from test_simulation_database import business_fingerprint

D = Decimal
ENDPOINT = "/api/simulations/compare"


def comparison_body(*parameters, start=DAY, end=DAY):
    return {
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "scenarios": [
            {"id": str(uuid4()), "name": f"Strategy {index + 1}", "parameters": values}
            for index, values in enumerate(parameters or ({}, {}))
        ],
    }


def compare(client, body=None):
    response = client.post(ENDPOINT, json=body or comparison_body())
    assert response.status_code == 200, response.text
    return response.json()


def test_two_scenarios_reuse_preview_and_preserve_contract(finance_client, finance_case, db_session):
    request = comparison_body({}, {"discount_pct": "10"})
    request["scenarios"][0]["name"] = "  Hold prices  "
    result = compare(finance_client, request)
    assert result["model_version"] == "aggregate-v1"
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", result["snapshot_id"])
    assert result["store_id"] == str(DEMO_STORE_ID)
    assert result["currency"] == "USD"
    assert result["baseline"] == FinanceService(db_session).get_summary(DAY, DAY).model_dump(mode="json")
    assert result["reporting_period"] == {"start": "2026-09-01", "end": "2026-09-01"}
    assert result["assumptions"] and isinstance(result["warnings"], list)
    assert [row["id"] for row in result["scenarios"]] == [row["id"] for row in request["scenarios"]]
    assert result["scenarios"][0]["name"] == "Hold prices"
    for scenario, supplied in zip(result["scenarios"], request["scenarios"]):
        response = finance_client.post("/api/simulations/preview", json={
            "start_date": request["start_date"], "end_date": request["end_date"],
            "parameters": supplied["parameters"],
        })
        assert response.status_code == 200
        preview = response.json()
        for field in ("status", "parameters", "simulated", "differences", "assumptions", "warnings"):
            assert scenario[field] == preview[field], field
    assert result["scenarios"][0]["simulated"]["operating_profit"] == "70.00"
    assert result["scenarios"][1]["simulated"]["operating_profit"] == "47.50"


def test_four_scenarios_have_independent_financial_and_operational_differences(finance_client, finance_case):
    result = compare(finance_client, comparison_body(
        {},
        {"discount_pct": "10", "expected_conversion_rate": "3",
         "advertising_budget_change_amount": "5", "additional_operating_expense_amount": "7"},
        {"expected_conversion_rate": "1"},
        {"discount_pct": "100"},
    ))
    assert len(result["scenarios"]) == 4
    unchanged, changed, lower_volume, loss = result["scenarios"]
    assert all(row["status"] == "ready" for row in result["scenarios"])
    assert changed["simulated"]["revenue"] == "318.75"
    assert changed["simulated"]["gross_profit"] == "213.75"
    assert changed["simulated"]["operating_expenses"] == "97.00"
    assert changed["simulated"]["advertising_expenditure"] == "15.00"
    assert changed["simulated"]["operating_profit"] == "101.75"
    assert changed["differences"]["revenue"] == "83.75"
    assert changed["differences"]["revenue_change_pct"] == "35.64"
    assert changed["differences"]["gross_profit"] == "48.75"
    assert changed["differences"]["operating_profit"] == "31.75"
    assert changed["differences"]["profit_change_pct"] == "45.36"
    assert D(changed["differences"]["orders"]) == 1
    assert changed["comparison"] == {
        "orders_change_pct": "50.00", "gross_profit_change_pct": "29.55",
        "operating_expenses_difference": "12.00", "operating_expenses_change_pct": "14.12",
        "advertising_expenditure_difference": "5.00", "advertising_expenditure_change_pct": "50.00",
        "conversion_rate_difference_pp": "1.000000", "operating_profit_margin_difference_pp": "2.13",
    }
    assert unchanged["differences"]["operating_profit"] == "0.00"
    assert lower_volume["simulated"]["operating_profit"] == "-7.50"
    assert loss["simulated"]["revenue"] == "10.00"
    assert loss["simulated"]["gross_profit"] == "-60.00"
    assert loss["simulated"]["operating_profit"] == "-155.00"
    assert loss["simulated"]["operating_profit_margin"] == "-1550.00"
    assert loss["warnings"]


def test_each_comparison_loads_one_baseline_and_query_count_does_not_scale_with_scenarios(
    finance_client, finance_case, db_session, monkeypatch,
):
    from app.services import simulation_comparison

    loads, received, statements = [], [], []
    original_summary = FinanceService.get_summary
    original_simulate = simulation_comparison.simulate

    def record_summary(service, *args, **kwargs):
        baseline = original_summary(service, *args, **kwargs)
        loads.append(baseline)
        return baseline

    def record_simulate(baseline, parameters):
        received.append(baseline)
        return original_simulate(baseline, parameters)

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split(None, 1)[0].upper())

    monkeypatch.setattr(FinanceService, "get_summary", record_summary)
    monkeypatch.setattr(simulation_comparison, "simulate", record_simulate)
    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        first = compare(finance_client, comparison_body({}, {}))
        first_count = len(statements)
        assert len(loads) == 1 and len(received) == 2
        assert all(baseline is received[0] for baseline in received)
        received.clear()
        statements.clear()
        second = compare(finance_client, comparison_body({}, {}, {}, {}))
        assert len(loads) == 2 and len(received) == 4
        assert all(baseline is received[0] for baseline in received)
        assert len(statements) == first_count and first_count > 0
        assert set(statements) == {"SELECT"}
        assert first["baseline"] == second["baseline"]
        assert first["snapshot_id"] == second["snapshot_id"]
    finally:
        event.remove(connection, "before_cursor_execute", capture)


def test_identical_scenarios_and_order_are_deterministic_without_historical_writes(
    finance_client, finance_case, db_session,
):
    parameters = {"expected_conversion_rate": "2.3456", "discount_pct": "17.25"}
    request = comparison_body(parameters, parameters)
    before = business_fingerprint(db_session)
    result = compare(finance_client, request)
    assert compare(finance_client, request) == result
    first, second = result["scenarios"]
    for field in ("parameters", "status", "simulated", "differences", "comparison", "assumptions", "warnings"):
        assert first[field] == second[field], field
    assert D(first["simulated"]["expected_orders"]) == D("2.345600")
    request["scenarios"].reverse()
    reversed_result = compare(finance_client, request)
    assert reversed_result["snapshot_id"] == result["snapshot_id"]
    assert reversed_result["scenarios"] == list(reversed(result["scenarios"]))
    assert business_fingerprint(db_session) == before
    db_session.add(Expense(store_id=DEMO_STORE_ID, category="rent", amount=D("1.23"), expense_date=DAY,
                           description="Relevant historical change must change snapshot identity"))
    db_session.flush()
    after = compare(finance_client, request)
    assert after["snapshot_id"] != result["snapshot_id"]
    assert after["baseline"]["operating_profit"] == "68.77"


def test_undefined_comparison_percentages_remain_null(finance_client, finance_case, db_session):
    # Baseline gross profit, operating profit and advertising are exactly zero.
    # The historic merchandise basket remains usable, so comparisons can run.
    from app.db.models import AdSpend
    finance_case.item_b.unit_cost_snapshot = D("195")
    db_session.execute(delete(Expense).where(Expense.store_id == DEMO_STORE_ID))
    db_session.execute(delete(AdSpend).where(AdSpend.store_id == DEMO_STORE_ID))
    db_session.flush()
    result = compare(finance_client, comparison_body({}, {
        "selling_price_change_pct": "10", "advertising_budget_change_amount": "5",
        "additional_operating_expense_amount": "2",
    }))
    assert result["baseline"]["gross_profit"] == "0.00"
    assert result["baseline"]["operating_profit"] == "0.00"
    row = result["scenarios"][1]
    assert row["differences"]["operating_profit"] == "15.50"
    assert row["differences"]["profit_change_pct"] is None
    for field in ("gross_profit_change_pct", "operating_expenses_change_pct", "advertising_expenditure_change_pct"):
        assert row["comparison"][field] is None, field
    assert row["comparison"]["advertising_expenditure_difference"] == "5.00"
    assert row["warnings"]


def test_missing_baseline_is_shared_and_disclosed_for_every_scenario(finance_client, finance_case, db_session):
    finance_case.item_a.price_includes_vat = None
    db_session.flush()
    result = compare(finance_client, comparison_body({}, {"expected_conversion_rate": "5"}))
    assert result["baseline"]["data_completeness"]["is_complete"] is False
    assert result["warnings"]
    for row in result["scenarios"]:
        assert row["status"] == "unavailable"
        assert row["simulated"] is None and row["differences"] is None and row["comparison"] is None
        assert row["warnings"] and row["assumptions"]


def test_one_unsupported_assumption_does_not_hide_an_explicit_valid_scenario(finance_client, finance_case, db_session):
    traffic = db_session.scalar(select(DailyTraffic).where(DailyTraffic.store_id == DEMO_STORE_ID))
    traffic.visitors = 1
    db_session.flush()
    result = compare(finance_client, comparison_body({}, {"expected_conversion_rate": "50"}))
    assert result["baseline"]["order_count"] == 2
    assert result["baseline"]["visitors"] == 1
    inherited, explicit = result["scenarios"]
    assert inherited["status"] == "unavailable" and inherited["comparison"] is None
    assert explicit["status"] == "ready"
    assert D(explicit["simulated"]["expected_orders"]) == D("0.5")
    assert D(explicit["comparison"]["conversion_rate_difference_pp"]) == D("-150")


@pytest.mark.parametrize("invalid", [
    "one", "five", "duplicate_id", "empty_name", "long_name", "invalid_id",
    "invalid_parameter", "float_parameter", "extra_parameter", "long_period", "body_selector", "query_selector",
])
def test_invalid_comparison_configuration_returns_validation_error(invalid):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    body = comparison_body()
    endpoint = ENDPOINT
    if invalid == "one":
        body["scenarios"] = body["scenarios"][:1]
    elif invalid == "five":
        body = comparison_body({}, {}, {}, {}, {})
    elif invalid == "duplicate_id":
        body["scenarios"][1]["id"] = body["scenarios"][0]["id"]
    elif invalid == "empty_name":
        body["scenarios"][0]["name"] = " \t "
    elif invalid == "long_name":
        body["scenarios"][0]["name"] = "x" * 81
    elif invalid == "invalid_id":
        body["scenarios"][0]["id"] = "not-a-uuid"
    elif invalid == "invalid_parameter":
        body["scenarios"][0]["parameters"] = {"expected_conversion_rate": "100.01"}
    elif invalid == "float_parameter":
        body["scenarios"][0]["parameters"] = {"discount_pct": 0.1}
    elif invalid == "extra_parameter":
        body["scenarios"][0]["parameters"] = {"unknown": "1"}
    elif invalid == "long_period":
        body["start_date"], body["end_date"] = "2025-09-01", "2026-09-02"
    elif invalid == "body_selector":
        body["store_id"] = str(uuid4())
    else:
        endpoint += "?store_id=other"
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(endpoint, json=body)
    assert response.status_code == 422, response.text


def test_raw_nan_and_contextual_negative_advertising_fail_with_safe_422(finance_client, finance_case):
    body = comparison_body({}, {"advertising_budget_change_amount": "-10.01"})
    response = finance_client.post(ENDPOINT, json=body)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_simulation"
    assert "scenarios" not in response.json()
    body["scenarios"][1]["parameters"] = {"discount_pct": "__RAW_NAN__"}
    response = finance_client.post(ENDPOINT, content=json.dumps(body).replace('"__RAW_NAN__"', "NaN"),
                                   headers={"Content-Type": "application/json"})
    assert response.status_code == 422, response.text
    errors = response.json()["detail"]
    assert errors[0]["loc"] == ["body", "scenarios", 1, "parameters", "discount_pct"]
    assert all("input" not in error and "ctx" not in error for error in errors)


def test_comparison_uses_real_read_only_repeatable_read_dependency(postgres_engine, monkeypatch):
    assert re.fullmatch(r"rdl_test_[0-9a-f]{32}", postgres_engine.url.database)
    with Session(postgres_engine) as session, session.begin():
        assert all(session.scalar(select(table.c.id).limit(1)) is None for table in Base.metadata.sorted_tables)
        seed_database(session)
    with Session(postgres_engine) as session:
        before = business_fingerprint(session)
    transaction_states, statements = [], []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split(None, 1)[0].upper())
        if statement.startswith("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"):
            cursor.execute("SHOW transaction_read_only")
            read_only = cursor.fetchone()[0]
            cursor.execute("SHOW transaction_isolation")
            transaction_states.append((read_only, cursor.fetchone()[0]))

    monkeypatch.setattr(database_session, "get_engine", lambda: postgres_engine)
    event.listen(postgres_engine, "after_cursor_execute", capture)
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as client:
            result = compare(client, comparison_body({}, {"discount_pct": "10"},
                             start=DEMO_PERIOD_START, end=DEMO_PERIOD_END))
        assert result["baseline"]["revenue"] == "29371.63"
        assert result["scenarios"][0]["simulated"]["revenue"] == "29371.63"
        assert transaction_states == [("on", "repeatable read")]
        assert statements and set(statements) <= {"SET", "SELECT"}
        with Session(postgres_engine) as session:
            assert business_fingerprint(session) == before
    finally:
        event.remove(postgres_engine, "after_cursor_execute", capture)
        with postgres_engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(delete(table))
