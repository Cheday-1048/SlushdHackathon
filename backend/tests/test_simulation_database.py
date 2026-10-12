"""Simulation HTTP/persistence tests against isolated, migrated PostgreSQL.

The shared Phase 03 fixture has independently known mixed-VAT, discounted,
refunded merchandise and separate customer/carrier shipping values. Expected
scenario totals below are hand-calculated, not generated with the engine under
test. Every regular test rolls back its writes; the final dependency test uses
only the UUID-named disposable database created by conftest.py.
"""

from datetime import timedelta
from decimal import Decimal
import hashlib
import json
import re
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db import session as database_session
from app.db.base import Base
from app.db.demo import DEMO_PERIOD_END, DEMO_PERIOD_START, DEMO_STORE_ID
from app.db.models import AdSpend, DailyTraffic, Expense, Organization, Product, Store
from app.main import create_app
from app.seed import seed_database
from app.services.financial_reporting import FinanceService

# Reuse data construction, never expected scenario output, from Phase 03.
from test_finance_database import (
    AT, DAY, add_refund, add_sale, finance_case, finance_client, finance_store,
)

D = Decimal
ENDPOINT = "/api/simulations/preview"


def request_body(parameters=None, start=DAY, end=DAY):
    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "parameters": parameters or {},
    }


def preview(client, parameters=None, start=DAY, end=DAY):
    response = client.post(ENDPOINT, json=request_body(parameters, start, end))
    assert response.status_code == 200, response.text
    return response.json()


def assert_money(metrics, expected):
    for key, value in expected.items():
        assert isinstance(metrics[key], str), key
        assert re.fullmatch(r"-?\d+\.\d{2}", metrics[key]), key
        assert metrics[key] == value, key


def business_fingerprint(session):
    """Hash complete rows, including metadata and untouched catalog values."""
    records = {
        table.fullname: [dict(row) for row in session.execute(select(table).order_by(table.c.id)).mappings()]
        for table in Base.metadata.sorted_tables
    }
    return hashlib.sha256(json.dumps(records, sort_keys=True, default=str).encode()).hexdigest()


def test_preview_baseline_reconciles_finance_and_identity_is_not_a_new_discount(
    finance_client, finance_case, db_session,
):
    body = preview(finance_client)
    assert body["model_version"] == "aggregate-v1"
    assert body["status"] == "ready"
    assert body["store_id"] == str(DEMO_STORE_ID)
    assert body["currency"] == "USD"
    assert body["reporting_period"] == {"start": "2026-09-01", "end": "2026-09-01"}
    assert body["baseline"] == FinanceService(db_session).get_summary(DAY, DAY).model_dump(mode="json")
    assert body["baseline"]["discounts"] == "30.00"
    assert body["baseline"]["refunds"] == "45.00"
    assert_money(body["simulated"], {
        "revenue": "235.00", "customer_shipping_revenue": "10.00", "cogs": "70.00",
        "gross_profit": "165.00", "operating_expenses": "85.00",
        "advertising_expenditure": "10.00", "operating_profit": "70.00",
        "gross_profit_margin": "70.21", "operating_profit_margin": "29.79",
    })
    assert D(body["simulated"]["expected_orders"]) == 2
    assert D(body["simulated"]["expected_visitors"]) == 100
    assert body["simulated"]["conversion_rate_source"] == "historical_ratio"
    assert_money(body["differences"], {
        "revenue": "0.00", "gross_profit": "0.00", "operating_profit": "0.00",
        "revenue_change_pct": "0.00", "profit_change_pct": "0.00",
    })
    assert body["assumptions"] and all(isinstance(item, str) for item in body["assumptions"])
    assert isinstance(body["warnings"], list)
    assert body["parameters"]["expected_conversion_rate"] is None


@pytest.mark.parametrize(("parameters", "expected"), [
    ({"selling_price_change_pct": "10"}, {"revenue": "257.50", "operating_profit": "92.50"}),
    ({"discount_pct": "10"}, {"revenue": "212.50", "operating_profit": "47.50"}),
    ({"selling_price_change_pct": "10", "discount_pct": "10"},
     {"revenue": "232.75", "operating_profit": "67.75"}),
    ({"expected_conversion_rate": "3"},
     {"revenue": "352.50", "cogs": "105.00", "shipping_expenses": "12.00",
      "platform_fees": "3.00", "operating_expenses": "90.00", "operating_profit": "147.50"}),
    ({"visitor_change_pct": "50"},
     {"revenue": "352.50", "cogs": "105.00", "operating_profit": "147.50"}),
    ({"unit_cost_change_pct": "20"}, {"cogs": "84.00", "operating_profit": "56.00"}),
    ({"advertising_budget_change_amount": "3.27"},
     {"advertising_expenditure": "13.27", "operating_profit": "66.73"}),
    ({"additional_operating_expense_amount": "4.56"},
     {"operating_expenses": "89.56", "other_operating_expenses": "9.56", "operating_profit": "65.44"}),
    ({"selling_price_change_pct": "10", "discount_pct": "20", "expected_conversion_rate": "2.5",
      "visitor_change_pct": "20", "unit_cost_change_pct": "25",
      "advertising_budget_change_amount": "5", "additional_operating_expense_amount": "7"},
     {"revenue": "312.00", "customer_shipping_revenue": "15.00", "cogs": "131.25",
      "gross_profit": "180.75", "operating_expenses": "97.00", "advertising_expenditure": "15.00",
      "operating_profit": "68.75"}),
])
def test_database_scenarios_have_independent_expected_totals(finance_client, finance_case, parameters, expected):
    body = preview(finance_client, parameters)
    assert body["status"] == "ready"
    assert_money(body["simulated"], expected)
    assert body["baseline"]["revenue"] == "235.00"
    assert body["baseline"]["operating_profit"] == "70.00"
    assert body["simulated"]["employee_expenses"] == "50.00"
    assert body["simulated"]["rent_expenses"] == "20.00"


def test_fractional_expected_orders_are_preserved_through_money_calculation(finance_client, finance_case):
    body = preview(finance_client, {"expected_conversion_rate": "2.3456"})
    simulated = body["simulated"]
    assert D(simulated["expected_orders"]) == D("2.345600")
    assert D(simulated["assumed_conversion_rate"]) == D("2.3456")
    assert simulated["conversion_rate_source"] == "user_assumption"
    assert_money(simulated, {"revenue": "275.61", "cogs": "82.10", "shipping_expenses": "9.38",
                             "platform_fees": "2.35", "operating_profit": "96.78"})


def test_seed_identity_uses_unrounded_order_to_visitor_ratio(finance_client, seeded_session):
    body = preview(finance_client, start=DEMO_PERIOD_START, end=DEMO_PERIOD_END)
    assert body["status"] == "ready"
    assert body["baseline"]["order_count"] == 342
    assert body["baseline"]["visitors"] == 11635
    assert body["baseline"]["conversion_rate"] == "2.94"
    assert D(body["simulated"]["expected_orders"]) == 342
    for field in ("revenue", "cogs", "gross_profit", "operating_expenses", "advertising_expenditure",
                  "operating_profit", "gross_profit_margin", "operating_profit_margin"):
        assert body["simulated"][field] == body["baseline"][field], field
    assert body["baseline"] == FinanceService(seeded_session).get_summary().model_dump(mode="json")


def test_catalog_edits_cannot_change_historical_simulation_baseline_or_results(
    finance_client, finance_case, db_session,
):
    parameters = {"discount_pct": "10", "unit_cost_change_pct": "20"}
    before = preview(finance_client, parameters)
    finance_case.product.selling_price = D("0.01")
    finance_case.product.unit_cost = D("999999.99")
    finance_case.product.vat_rate = D("0")
    db_session.flush()
    db_session.expire_all()
    assert preview(finance_client, parameters) == before


def test_identical_previews_are_deterministic_and_preserve_every_business_row(
    finance_client, finance_case, db_session,
):
    before = business_fingerprint(db_session)
    statements = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split(None, 1)[0].upper())

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        parameters = {"discount_pct": "17.25", "expected_conversion_rate": "3.1250",
                      "advertising_budget_change_amount": "4.32"}
        first = preview(finance_client, parameters)
        assert preview(finance_client, parameters) == first
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    assert statements and set(statements) == {"SELECT"}
    assert business_fingerprint(db_session) == before


def test_scenarios_do_not_double_count_advertising_ledger_mirrors(finance_client, finance_case, db_session):
    body = preview(finance_client, {"advertising_budget_change_amount": "5"})
    assert body["simulated"]["advertising_expenditure"] == "15.00"
    assert body["simulated"]["operating_profit"] == "65.00"
    db_session.add(Expense(store_id=DEMO_STORE_ID, category="advertising", amount=D("888888"),
                           expense_date=DAY, description="Another mirror, not additional campaign spend"))
    db_session.flush()
    assert preview(finance_client, {"advertising_budget_change_amount": "5"}) == body


def test_negative_profit_is_preserved_with_visible_warning(finance_client, finance_case):
    body = preview(finance_client, {"discount_pct": "100"})
    assert body["status"] == "ready"
    assert_money(body["simulated"], {"revenue": "10.00", "cogs": "70.00", "operating_profit": "-155.00"})
    assert body["differences"]["operating_profit"] == "-225.00"
    assert body["warnings"]


@pytest.mark.parametrize("parameters", [{"visitor_change_pct": "-100"}, {"expected_conversion_rate": "0"}])
def test_zero_projected_volume_keeps_fixed_costs_and_explicit_advertising(
    finance_client, finance_case, parameters,
):
    body = preview(finance_client, parameters)
    assert body["status"] == "ready"
    assert D(body["simulated"]["expected_orders"]) == 0
    assert_money(body["simulated"], {"revenue": "0.00", "cogs": "0.00", "shipping_expenses": "0.00",
                                     "platform_fees": "0.00", "operating_expenses": "75.00",
                                     "advertising_expenditure": "10.00", "operating_profit": "-85.00"})
    assert body["simulated"]["operating_profit_margin"] is None


@pytest.mark.parametrize("extra_cost", ["70", "80"])
def test_nonpositive_baseline_profit_has_no_misleading_percentage_change(
    finance_client, finance_case, db_session, extra_cost,
):
    db_session.add(Expense(store_id=DEMO_STORE_ID, category="rent", amount=D(extra_cost), expense_date=DAY,
                           description="Zero or negative historical operating profit"))
    db_session.flush()
    body = preview(finance_client, {"selling_price_change_pct": "10"})
    assert body["status"] == "ready"
    assert body["differences"]["operating_profit"] == "22.50"
    assert body["differences"]["profit_change_pct"] is None


@pytest.mark.parametrize("visitors", [0, 100])
def test_no_historical_orders_cannot_invent_a_basket(finance_client, finance_store, db_session, visitors):
    db_session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=DAY, visitors=visitors, sessions=visitors))
    db_session.flush()
    body = preview(finance_client, {"expected_conversion_rate": "5"})
    assert body["status"] == "unavailable"
    assert body["baseline"]["order_count"] == 0
    assert body["baseline"]["visitors"] == visitors
    assert body["baseline"]["revenue"] == "0.00"
    assert body["simulated"] is None and body["differences"] is None
    assert body["warnings"]


def test_historical_orders_without_visitors_remain_unavailable(finance_client, finance_case, db_session):
    traffic = db_session.scalar(select(DailyTraffic).where(DailyTraffic.store_id == DEMO_STORE_ID))
    traffic.visitors = 0
    db_session.flush()
    body = preview(finance_client, {"expected_conversion_rate": "5"})
    assert body["status"] == "unavailable"
    assert body["baseline"]["order_count"] == 2
    assert body["baseline"]["visitors"] == 0
    assert body["simulated"] is None
    assert body["warnings"]


@pytest.mark.parametrize("missing", ["vat", "shipping", "restock", "traffic"])
def test_unknown_financial_history_is_visible_and_never_replaced_with_zero(
    finance_client, finance_case, db_session, missing,
):
    if missing == "vat":
        finance_case.item_a.price_includes_vat = None
    elif missing == "shipping":
        finance_case.order_a.shipping_amount = None
    elif missing == "restock":
        finance_case.refund_a.quantity_restocked = None
    else:
        db_session.execute(delete(DailyTraffic).where(DailyTraffic.store_id == DEMO_STORE_ID))
    db_session.flush()
    body = preview(finance_client)
    assert body["status"] == "unavailable"
    assert body["baseline"]["data_completeness"]["is_complete"] is False
    assert body["simulated"] is None and body["differences"] is None
    assert body["warnings"]
    assert body["baseline"]["data_completeness"]["warnings"]


def test_reporting_period_is_applied_to_real_sales_traffic_and_costs(
    finance_client, finance_case, db_session, add_sale,
):
    tomorrow = DAY + timedelta(days=1)
    add_sale(at=AT + timedelta(days=1), price="60", cost="20")
    db_session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=tomorrow, visitors=50, sessions=50))
    db_session.add(Expense(store_id=DEMO_STORE_ID, category="rent", amount=D("7"), expense_date=tomorrow,
                           description="Only the next reporting day"))
    db_session.flush()
    today = preview(finance_client)
    later = preview(finance_client, start=tomorrow, end=tomorrow)
    assert today["baseline"]["revenue"] == "235.00"
    assert later["baseline"]["revenue"] == "50.00"
    assert later["baseline"]["order_count"] == 1
    assert later["baseline"]["visitors"] == 50
    assert later["baseline"]["operating_profit"] == "23.00"
    assert later["simulated"]["operating_profit"] == "23.00"


def test_other_store_records_cannot_enter_the_baseline(finance_client, finance_case, db_session, add_sale):
    before = preview(finance_client)
    organization = Organization(id=uuid4(), name="Unrelated organization", is_demo=True)
    db_session.add(organization)
    db_session.flush()
    store = Store(id=uuid4(), organization_id=organization.id, name="Unrelated store", currency="TRY",
                  timezone="UTC", is_demo=True)
    db_session.add(store)
    db_session.flush()
    product = Product(id=uuid4(), store_id=store.id, sku="OTHER", name="Unrelated inventory",
                      selling_price=D("9999"), unit_cost=D("1"), vat_rate=D("0"), stock_quantity=1)
    db_session.add(product)
    db_session.flush()
    add_sale(store=store, product=product, price="9999", cost="1")
    db_session.add(DailyTraffic(store_id=store.id, date=DAY, visitors=999999, sessions=999999))
    db_session.add(AdSpend(store_id=store.id, platform="Other", campaign_name="Other", amount=D("9999"),
                           spend_date=DAY))
    db_session.add(Expense(store_id=store.id, category="rent", amount=D("9999"), expense_date=DAY,
                           description="Outside configured demo scope"))
    db_session.flush()
    assert preview(finance_client) == before


@pytest.mark.parametrize("flag", ["organization", "store"])
def test_demo_flags_are_required_for_simulations(finance_client, finance_case, db_session, flag):
    getattr(finance_case, flag).is_demo = False
    db_session.flush()
    response = finance_client.post(ENDPOINT, json=request_body())
    assert response.status_code == 404
    assert response.json()["code"] == "demo_store_not_seeded"


def test_currency_is_taken_from_scoped_store_without_conversion(finance_client, finance_case, db_session):
    finance_case.store.currency = "TRY"
    db_session.flush()
    body = preview(finance_client, {"advertising_budget_change_amount": "12.34"})
    assert body["currency"] == body["baseline"]["currency"] == "TRY"
    assert body["simulated"]["advertising_expenditure"] == "22.34"


def test_negative_final_advertising_budget_is_rejected_but_exact_zero_is_valid(finance_client, finance_case):
    response = finance_client.post(ENDPOINT, json=request_body({"advertising_budget_change_amount": "-10.01"}))
    assert response.status_code == 422
    assert "simulated" not in response.json()
    valid = preview(finance_client, {"advertising_budget_change_amount": "-10.00"})
    assert valid["simulated"]["advertising_expenditure"] == "0.00"
    assert valid["simulated"]["operating_profit"] == "80.00"


@pytest.mark.parametrize("parameters", [
    {"selling_price_change_pct": "-100.01"}, {"visitor_change_pct": "-100.01"},
    {"expected_conversion_rate": "100.0001"}, {"expected_conversion_rate": "-0.0001"},
    {"discount_pct": "100.01"}, {"unit_cost_change_pct": "-101"},
    {"additional_operating_expense_amount": "-0.01"}, {"advertising_budget_change_amount": "1.001"},
    {"discount_pct": "0.00001"}, {"discount_pct": "NaN"}, {"visitor_change_pct": "Infinity"},
    {"selling_price_change_pct": 0.1}, {"discount_pct": True}, {"unknown_parameter": "1"},
    {"store_id": "00000000-0000-0000-0000-000000000000"},
])
def test_api_rejects_invalid_scenario_values_before_calculation(parameters):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(ENDPOINT, json=request_body(parameters))
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e999"])
def test_raw_nonfinite_or_overflow_json_numbers_return_safe_validation_errors(literal):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    # 1e999 is valid JSON syntax but overflows the default JSON float parser;
    # the remaining literals are also accepted by Python's permissive parser.
    body = ('{"start_date":"2026-09-01","end_date":"2026-09-01",'
            '"parameters":{"discount_pct":' + literal + '}}')
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(ENDPOINT, content=body, headers={
            "Content-Type": "application/json", "Origin": "http://localhost:5173",
        })
    assert response.status_code == 422, response.text
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    errors = response.json()["detail"]
    assert errors and errors[0]["loc"] == ["body", "parameters", "discount_pct"]
    assert all("input" not in error and "ctx" not in error for error in errors)


@pytest.mark.parametrize("changes", [
    {"start_date": None}, {"end_date": None}, {"start_date": "not-a-date"},
    {"start_date": "2026-09-02"}, {"start_date": "0001-01-01"},
    {"start_date": "9999-12-31", "end_date": "9999-12-31"},
    {"start_date": "2025-09-01", "end_date": "2026-09-02"},
    {"store_id": "00000000-0000-0000-0000-000000000000"},
    {"organization_id": "00000000-0000-0000-0000-000000000000"},
])
def test_api_rejects_invalid_periods_and_body_tenant_selectors(changes):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    body = request_body()
    body.update(changes)
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(ENDPOINT, json=body)
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("query", ["store_id=other", "organization_id=other", "start_date=2026-01-01", "unexpected=true"])
def test_api_rejects_query_overrides(query):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(f"{ENDPOINT}?{query}", json=request_body())
    assert response.status_code == 422, response.text


def test_missing_database_has_no_synthetic_simulation_fallback(monkeypatch):
    settings = Settings(database_url=None, migration_database_url=None, _env_file=None)
    monkeypatch.setattr(database_session, "get_settings", lambda: settings)
    database_session.get_engine.cache_clear()
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as client:
            response = client.post(ENDPOINT, json=request_body())
        assert response.status_code == 503
        assert response.json()["code"] == "database_not_configured"
        assert "baseline" not in response.json()
    finally:
        database_session.get_engine.cache_clear()


def test_cors_allows_simulation_post_only_for_configured_origins():
    with TestClient(create_app()) as client:
        allowed = client.options(ENDPOINT, headers={
            "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        })
        denied = client.options(ENDPOINT, headers={
            "Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST",
        })
    assert allowed.status_code == 200
    assert "POST" in allowed.headers["access-control-allow-methods"]
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers


def test_preview_uses_actual_read_only_postgresql_dependency(postgres_engine, monkeypatch):
    # This database is created/dropped by conftest, never the configured demo DB.
    assert re.fullmatch(r"rdl_test_[0-9a-f]{32}", postgres_engine.url.database)
    with Session(postgres_engine) as session, session.begin():
        assert all(session.scalar(select(table.c.id).limit(1)) is None for table in Base.metadata.sorted_tables)
        seed_database(session)
    with Session(postgres_engine) as session:
        before = business_fingerprint(session)

    statements = []
    read_only_states = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement.lstrip().split(None, 1)[0].upper())
        if statement.startswith("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"):
            cursor.execute("SHOW transaction_read_only")
            read_only_states.append(cursor.fetchone()[0])

    # Execute the real dependency with a new connection. Only its engine lookup
    # is redirected to the disposable DB, not its transaction/session behavior.
    monkeypatch.setattr(database_session, "get_engine", lambda: postgres_engine)
    event.listen(postgres_engine, "after_cursor_execute", capture)
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as client:
            body = preview(client, {"discount_pct": "10", "expected_conversion_rate": "3"},
                           start=DEMO_PERIOD_START, end=DEMO_PERIOD_END)
        assert body["status"] == "ready"
        assert body["baseline"]["revenue"] == "29371.63"
        assert read_only_states == ["on"]
        assert statements and set(statements) <= {"SET", "SELECT"}
        with Session(postgres_engine) as session:
            assert business_fingerprint(session) == before
    finally:
        event.remove(postgres_engine, "after_cursor_execute", capture)
        # Restore the otherwise empty *disposable test* database for later tests.
        with postgres_engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(delete(table))
