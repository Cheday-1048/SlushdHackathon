"""Analytics integration checks using isolated PostgreSQL and independent totals.

The Phase 03 fixtures provide deliberately different catalog and transaction
prices. Assertions below use explicit expected values, never a second financial
implementation in the tests. Existing finance reports are also reconciled as a
contract check.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.core.config import Settings
from app.db import session as database_session
from app.db.demo import DEMO_ORGANIZATION_ID, DEMO_STORE_ID
from app.db.models import AdSpend, DailyTraffic, Expense, Order, Organization, Product, Store
from app.main import create_app
from app.services.financial_reporting import FinanceService
from app.services import analytics as analytics_service

# Reuse data creation, not expected-output generation, from Phase 03.
from test_finance_database import (
    AT, DAY, add_refund, add_sale, finance_case, finance_client, finance_store,
)

D = Decimal
ENDPOINT = "/api/analytics/dashboard"


def get_analytics(client, start=DAY, end=DAY):
    response = client.get(ENDPOINT, params={"start_date": start.isoformat(), "end_date": end.isoformat()})
    assert response.status_code == 200, response.text
    return response.json()


def add_traffic(session, day, visitors=0):
    session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=day, visitors=visitors, sessions=visitors))
    session.flush()


def test_analytics_contract_matches_finance_and_independent_known_totals(finance_client, finance_case, db_session):
    body = get_analytics(finance_client)
    assert body["summary"] == FinanceService(db_session).get_summary(DAY, DAY).model_dump(mode="json")
    assert body["summary"]["revenue"] == "235.00"
    assert body["summary"]["operating_profit"] == "70.00"
    assert body["summary"]["store_id"] == str(DEMO_STORE_ID)
    assert body["summary"]["data_source"]["type"] == "database_demo"
    assert body["store_timezone"] == "UTC"
    assert body["selected_preset"] == "custom"
    date.fromisoformat(body["as_of_date"])
    assert len(body["daily"]) == 1
    daily = body["daily"][0]
    assert daily["date"] == DAY.isoformat()
    assert daily["revenue"] == "235.00"
    assert daily["gross_profit"] == "165.00"
    assert daily["operating_profit"] == "70.00"
    assert daily["order_count"] == 2
    assert daily["visitors"] == 100
    assert daily["conversion_rate"] == "2.00"
    assert daily["data_completeness"]["is_complete"] is True


def test_product_values_exclude_customer_shipping_and_unallocated_operating_costs(finance_client, finance_case):
    body = get_analytics(finance_client)
    assert len(body["products"]) == 1
    product = body["products"][0]
    assert product["product_id"] == str(finance_case.product.id)
    assert product["name"] == "Historical snapshot test"
    assert product["sku"] == "FINANCE"
    assert product["units_sold"] == 3
    assert product["units_returned"] == 1
    assert product["revenue"] == "225.00"
    assert product["cogs"] == "70.00"
    assert product["gross_profit"] == "155.00"
    assert product["gross_profit_margin"] == "68.89"
    assert product["data_completeness"]["is_complete"] is True
    assert body["unallocated_customer_shipping_revenue"] == "10.00"
    assert D(product["revenue"]) + D(body["unallocated_customer_shipping_revenue"]) == D(body["summary"]["revenue"])
    assert "operating_profit" not in product


def test_expense_categories_follow_finance_and_ignore_advertising_mirror(finance_client, finance_case):
    body = get_analytics(finance_client)
    expenses = {row["category"]: row for row in body["expenses"]}
    expected = {
        "employee_costs": "50.00", "rent": "20.00", "shipping": "8.00",
        "platform_fees": "2.00", "other_operating": "5.00", "advertising": "10.00",
    }
    assert set(expenses) == set(expected)
    for category, amount in expected.items():
        assert expenses[category]["amount"] == amount
        assert expenses[category]["label"]
    assert sum((D(row["amount"]) for row in expenses.values()), D(0)) == D("95.00")
    assert body["summary"]["operating_expenses"] == "85.00"
    assert body["summary"]["advertising_expenditure"] == "10.00"


def test_daily_rows_reconcile_finance_without_smoothing_booked_costs(
    finance_client, finance_case, db_session, add_sale, add_refund,
):
    tomorrow = DAY + timedelta(days=1)
    add_sale(at=AT + timedelta(days=1), price="60", cost="20")
    add_refund(finance_case.item_a, at=AT + timedelta(days=1), amount="54", restocked=0)
    db_session.add(Expense(store_id=DEMO_STORE_ID, category="rent", amount=D("7"), expense_date=tomorrow,
                           description="Booked on the second day only"))
    db_session.add(AdSpend(store_id=DEMO_STORE_ID, platform="Test", campaign_name="Second day", amount=D("2"),
                           spend_date=tomorrow))
    add_traffic(db_session, tomorrow, 50)
    body = get_analytics(finance_client, DAY, tomorrow)
    assert body["summary"] == FinanceService(db_session).get_summary(DAY, tomorrow).model_dump(mode="json")
    first, second = body["daily"]
    assert [row["date"] for row in body["daily"]] == [DAY.isoformat(), tomorrow.isoformat()]
    assert first["operating_expenses"] == "85.00"
    assert second["operating_expenses"] == "7.00"
    assert first["revenue"] == "235.00"
    assert second["revenue"] == "5.00"
    assert second["gross_profit"] == "-15.00"
    assert second["operating_profit"] == "-24.00"
    for key in ("revenue", "operating_expenses", "advertising_expenditure", "total_expenses", "gross_profit", "operating_profit"):
        assert sum((D(row[key]) for row in body["daily"]), D(0)) == D(body["summary"][key]), key
    assert body["summary"]["revenue"] == "240.00"
    assert body["summary"]["operating_profit"] == "46.00"
    assert body["summary"]["conversion_rate"] == "2.00"
    assert sum(row["order_count"] for row in body["daily"]) == body["summary"]["order_count"] == 3
    assert sum(row["visitors"] for row in body["daily"]) == body["summary"]["visitors"] == 150


def test_product_catalog_price_and_cost_edits_do_not_change_analytics(finance_client, finance_case, db_session):
    before = get_analytics(finance_client)
    finance_case.product.selling_price = D("0.01")
    finance_case.product.unit_cost = D("999999.99")
    finance_case.product.vat_rate = D("0")
    db_session.flush()
    db_session.expire_all()
    assert get_analytics(finance_client) == before


def test_multiple_products_keep_their_own_snapshot_costs_and_margins(finance_client, finance_case, db_session):
    second = Product(store_id=DEMO_STORE_ID, sku="SECOND", name="Second item", selling_price=D("1"),
                     unit_cost=D("999"), vat_rate=D("0"), stock_quantity=1)
    db_session.add(second)
    db_session.flush()
    finance_case.item_b.product_id = second.id
    db_session.flush()
    products = {row["sku"]: row for row in get_analytics(finance_client)["products"]}
    assert len(products) == 2
    assert products["FINANCE"]["units_sold"] == 2
    assert products["FINANCE"]["units_returned"] == 1
    assert products["FINANCE"]["revenue"] == "135.00"
    assert products["FINANCE"]["cogs"] == "40.00"
    assert products["FINANCE"]["gross_profit"] == "95.00"
    assert products["FINANCE"]["gross_profit_margin"] == "70.37"
    assert products["SECOND"]["units_sold"] == 1
    assert products["SECOND"]["units_returned"] == 0
    assert products["SECOND"]["revenue"] == "90.00"
    assert products["SECOND"]["cogs"] == "30.00"
    assert products["SECOND"]["gross_profit"] == "60.00"
    assert products["SECOND"]["gross_profit_margin"] == "66.67"


def test_missing_tax_basis_only_invalidates_the_affected_product(finance_client, finance_case, db_session):
    second = Product(store_id=DEMO_STORE_ID, sku="KNOWN", name="Known history", selling_price=D("1"),
                     unit_cost=D("999"), vat_rate=D("0"), stock_quantity=1)
    db_session.add(second)
    db_session.flush()
    finance_case.item_b.product_id = second.id
    finance_case.item_a.price_includes_vat = None
    db_session.flush()
    body = get_analytics(finance_client)
    products = {row["sku"]: row for row in body["products"]}
    assert body["summary"]["revenue"] is None
    assert products["FINANCE"]["revenue"] is None
    assert products["FINANCE"]["data_completeness"]["is_complete"] is False
    assert products["KNOWN"]["revenue"] == "90.00"
    assert products["KNOWN"]["cogs"] == "30.00"
    assert products["KNOWN"]["gross_profit"] == "60.00"
    assert products["KNOWN"]["data_completeness"]["is_complete"] is True


def test_prior_period_sale_current_refund_keeps_product_and_negative_revenue(
    finance_client, finance_store, db_session, add_sale, add_refund,
):
    _, item = add_sale(at=AT - timedelta(days=2), status="returned")
    add_refund(item)
    add_traffic(db_session, DAY)
    body = get_analytics(finance_client)
    assert body["summary"]["order_count"] == 0
    assert body["summary"]["revenue"] == body["daily"][0]["revenue"] == "-100.00"
    assert body["summary"]["cogs"] == "-40.00"
    assert body["summary"]["gross_profit"] == "-60.00"
    product = body["products"][0]
    assert product["units_sold"] == 0
    assert product["units_returned"] == 1
    assert product["revenue"] == "-100.00"
    assert product["cogs"] == "-40.00"
    assert product["gross_profit"] == "-60.00"
    assert product["gross_profit_margin"] is None
    assert product["data_completeness"]["is_complete"] is True


@pytest.mark.parametrize("status", ["pending", "cancelled"])
def test_unrecognized_orders_and_refund_events_do_not_enter_analytics(
    finance_client, finance_case, add_sale, add_refund, status,
):
    before = get_analytics(finance_client)
    _, ignored = add_sale(status=status, price="9999", shipping="9999")
    add_refund(ignored, amount="9999")
    add_refund(finance_case.item_a, status=status, amount="9999", returned=99, restocked=99)
    assert get_analytics(finance_client) == before


@pytest.mark.parametrize("missing", ["sale_vat", "refund_vat", "restocking"])
def test_missing_financial_data_remains_null_in_daily_and_product_metrics(
    finance_client, finance_case, db_session, missing,
):
    if missing == "sale_vat":
        finance_case.item_a.price_includes_vat = None
    elif missing == "refund_vat":
        finance_case.refund_a.amount_includes_vat = None
    else:
        finance_case.refund_a.quantity_restocked = None
    db_session.flush()
    body = get_analytics(finance_client)
    daily, product = body["daily"][0], body["products"][0]
    assert daily["gross_profit"] is daily["operating_profit"] is product["gross_profit"] is None
    assert daily["data_completeness"]["is_complete"] is False
    assert product["data_completeness"]["is_complete"] is False
    assert daily["data_completeness"]["warnings"] and product["data_completeness"]["warnings"]
    if missing == "restocking":
        assert daily["revenue"] == "235.00"
        assert product["revenue"] == "225.00"
        assert product["cogs"] is None
    else:
        assert daily["revenue"] is product["revenue"] is None
        assert product["cogs"] == "70.00"


def test_unknown_customer_shipping_does_not_invent_product_allocation(finance_client, finance_case, db_session):
    finance_case.order_a.shipping_amount = None
    db_session.flush()
    body = get_analytics(finance_client)
    assert body["summary"]["revenue"] is body["daily"][0]["revenue"] is None
    assert body["unallocated_customer_shipping_revenue"] is None
    assert body["products"][0]["revenue"] == "225.00"
    assert body["products"][0]["gross_profit"] == "155.00"


def test_missing_refund_ledger_warns_current_product_without_invented_zero(
    finance_client, finance_store, db_session, add_sale,
):
    add_sale(at=AT - timedelta(days=10), status="returned")
    add_traffic(db_session, DAY)
    body = get_analytics(finance_client)
    assert body["summary"]["revenue"] is body["daily"][0]["revenue"] is None
    assert body["summary"]["data_completeness"]["missing_refund_orders"] == 1
    assert body["daily"][0]["data_completeness"]["missing_refund_orders"] == 1
    assert body["product_warnings"]
    # The affected product may be represented as incomplete or the uncertain
    # event may remain unallocated; neither route may invent a numeric result.
    for product in body["products"]:
        assert product["revenue"] is None
        assert product["gross_profit"] is None


def test_undated_refund_uncertainty_begins_at_the_original_sale_day(
    finance_client, finance_store, db_session, add_sale,
):
    add_sale(status="returned")
    add_traffic(db_session, DAY - timedelta(days=1))
    add_traffic(db_session, DAY)
    body = get_analytics(finance_client, DAY - timedelta(days=1), DAY)
    before_sale, sale_day = body["daily"]
    assert before_sale["revenue"] == "0.00"
    assert before_sale["data_completeness"]["is_complete"] is True
    assert sale_day["revenue"] is None
    assert sale_day["data_completeness"]["missing_refund_orders"] == 1


def test_missing_order_items_warns_without_fabricating_product_rows(finance_client, finance_store, db_session):
    db_session.add(Order(store_id=DEMO_STORE_ID, order_number="analytics-missing-item", order_date=AT,
                         status="completed", shipping_amount=D("0"), shipping_vat_rate=D("0"),
                         shipping_price_includes_vat=False))
    add_traffic(db_session, DAY, 10)
    body = get_analytics(finance_client)
    assert body["summary"]["revenue"] is body["daily"][0]["revenue"] is None
    assert body["summary"]["data_completeness"]["missing_order_items"] == 1
    assert body["products"] == []
    assert body["product_warnings"]


def test_missing_traffic_is_null_while_recorded_zero_visitors_is_zero(finance_client, finance_store, db_session):
    tomorrow = DAY + timedelta(days=1)
    add_traffic(db_session, tomorrow)
    body = get_analytics(finance_client, DAY, tomorrow)
    missing, zero = body["daily"]
    assert missing["visitors"] is missing["conversion_rate"] is None
    assert missing["data_completeness"]["traffic_days"] == 0
    assert zero["visitors"] == 0 and zero["conversion_rate"] == "0.00"
    assert zero["data_completeness"]["is_complete"] is True
    assert body["summary"]["conversion_rate"] is None
    assert body["summary"]["data_completeness"]["traffic_days"] == 1


def test_orders_with_zero_recorded_visitors_have_null_conversion(finance_client, add_sale, db_session):
    add_sale()
    add_traffic(db_session, DAY)
    body = get_analytics(finance_client)
    assert body["summary"]["conversion_rate"] is body["daily"][0]["conversion_rate"] is None
    assert body["daily"][0]["visitors"] == 0
    assert body["summary"]["revenue"] == "100.00"
    assert body["summary"]["data_completeness"]["warnings"]


def test_conversion_can_exceed_one_hundred_for_multiple_orders_per_visit(finance_client, add_sale, db_session):
    add_sale()
    add_sale()
    add_traffic(db_session, DAY, 1)
    body = get_analytics(finance_client)
    assert body["summary"]["conversion_rate"] == body["daily"][0]["conversion_rate"] == "200.00"


def test_empty_range_has_every_calendar_date_and_no_invented_activity(finance_client, finance_store):
    end = DAY + timedelta(days=2)
    body = get_analytics(finance_client, DAY, end)
    assert [row["date"] for row in body["daily"]] == ["2026-09-01", "2026-09-02", "2026-09-03"]
    for row in body["daily"]:
        assert row["revenue"] == row["gross_profit"] == row["operating_profit"] == "0.00"
        assert row["order_count"] == 0
        assert row["visitors"] is row["conversion_rate"] is None
    assert body["products"] == []
    assert body["summary"]["average_order_value"] is None
    assert all(row["amount"] == "0.00" for row in body["expenses"])


def test_store_timezone_dst_buckets_orders_and_refunds_by_local_calendar_day(
    finance_client, finance_store, db_session, add_sale, add_refund,
):
    finance_store.store.timezone = "America/New_York"
    day = date(2026, 11, 1)
    start = datetime(2026, 11, 1, 4, tzinfo=timezone.utc)
    end = datetime(2026, 11, 2, 5, tzinfo=timezone.utc)
    _, historical = add_sale(at=start - timedelta(days=10), quantity=10)
    for timestamp in (start - timedelta(microseconds=1), start, end - timedelta(microseconds=1), end):
        add_sale(at=timestamp)
        add_refund(historical, at=timestamp, amount="12", returned=0, restocked=0)
    add_traffic(db_session, day, 20)
    body = get_analytics(finance_client, day, day)
    assert body["store_timezone"] == "America/New_York"
    assert body["summary"]["revenue"] == "180.00"
    assert body["summary"]["order_count"] == 2
    assert body["daily"][0]["date"] == "2026-11-01"
    assert body["daily"][0]["revenue"] == "180.00"
    assert body["daily"][0]["order_count"] == 2
    assert body["daily"][0]["conversion_rate"] == "10.00"
    assert body["products"][0]["units_sold"] == 2


@pytest.mark.parametrize("preset,days", [("last_7_days", 7), ("last_30_days", 30), ("last_90_days", 90)])
@pytest.mark.parametrize("zone,local_today", [
    ("America/Los_Angeles", date(2026, 9, 30)),
    ("Asia/Tokyo", date(2026, 10, 1)),
])
def test_rolling_presets_include_current_store_date_from_one_server_clock(
    finance_client, finance_store, db_session, monkeypatch, preset, days, zone, local_today,
):
    finance_store.store.timezone = zone
    db_session.flush()
    clock_reads = []

    def frozen_now():
        clock_reads.append(True)
        return datetime(2026, 10, 1, 0, 30, tzinfo=timezone.utc)

    monkeypatch.setattr(analytics_service, "utc_now", frozen_now)
    response = finance_client.get(ENDPOINT, params={"preset": preset})
    assert response.status_code == 200, response.text
    body = response.json()
    expected_start = local_today - timedelta(days=days - 1)
    assert clock_reads == [True]
    assert body["as_of_date"] == local_today.isoformat()
    assert body["selected_preset"] == preset
    assert body["store_timezone"] == zone
    assert body["summary"]["reporting_period"] == {"start": expected_start.isoformat(), "end": local_today.isoformat()}
    assert len(body["daily"]) == days
    assert body["daily"][0]["date"] == expected_start.isoformat()
    assert body["daily"][-1]["date"] == local_today.isoformat()
    assert body["summary"] == FinanceService(db_session).get_summary(expected_start, local_today).model_dump(mode="json")


def test_default_period_remains_demo_and_reconciles_all_seed_rows(finance_client, seeded_session):
    response = finance_client.get(ENDPOINT)
    assert response.status_code == 200
    body = response.json()
    assert body["selected_preset"] == "demo"
    assert body["summary"]["reporting_period"] == {"start": "2026-09-01", "end": "2026-09-30"}
    assert body["summary"] == FinanceService(seeded_session).get_summary().model_dump(mode="json")
    assert body["summary"]["revenue"] == "29371.63"
    assert body["summary"]["cogs"] == "10906.00"
    assert len(body["daily"]) == 30
    assert len(body["products"]) == 12
    for key in ("revenue", "gross_profit", "operating_profit", "operating_expenses", "advertising_expenditure"):
        assert sum((D(row[key]) for row in body["daily"]), D(0)) == D(body["summary"][key]), key
    assert sum((D(row["revenue"]) for row in body["products"]), D(0)) == D("29371.63")
    assert sum((D(row["cogs"]) for row in body["products"]), D(0)) == D("10906.00")


def test_demo_scope_excludes_other_store_from_all_analytics(
    finance_client, finance_case, db_session, add_sale, add_refund,
):
    before = get_analytics(finance_client)
    other = Store(id=uuid4(), organization_id=DEMO_ORGANIZATION_ID, name="Private store", currency="EUR",
                  timezone="UTC", is_demo=True)
    db_session.add(other)
    db_session.flush()
    product = Product(id=uuid4(), store_id=other.id, sku="SECRET", name="Confidential product", selling_price=D("99999"),
                      unit_cost=D("1"), vat_rate=D("20"), stock_quantity=1)
    db_session.add(product)
    db_session.flush()
    _, item = add_sale(store=other, product=product, price="99999", shipping="99999")
    add_refund(item, amount="120")
    db_session.add_all([
        Expense(store_id=other.id, category="rent", amount=D("99999"), expense_date=DAY, description="Confidential"),
        AdSpend(store_id=other.id, platform="Private", campaign_name="Private", amount=D("99999"), spend_date=DAY),
        DailyTraffic(store_id=other.id, date=DAY, visitors=99999, sessions=99999),
    ])
    db_session.flush()
    assert get_analytics(finance_client) == before


@pytest.mark.parametrize("flag", ["store", "organization"])
def test_analytics_requires_both_demo_flags(finance_client, finance_case, db_session, flag):
    getattr(finance_case, flag).is_demo = False
    db_session.flush()
    response = finance_client.get(ENDPOINT)
    assert response.status_code == 404
    assert response.json()["code"] == "demo_store_not_seeded"


def test_analytics_requires_the_configured_demo_organization(finance_client, finance_case, db_session):
    other = Organization(id=uuid4(), name="Different demo organization", is_demo=True)
    db_session.add(other)
    db_session.flush()
    finance_case.store.organization_id = other.id
    db_session.flush()
    assert finance_client.get(ENDPOINT).status_code == 404


@pytest.mark.parametrize("query", [
    "start_date=2026-09-01", "end_date=2026-09-30", "start_date=bad&end_date=bad",
    "start_date=2026-09-30&end_date=2026-09-01", "start_date=9999-12-31&end_date=9999-12-31",
    "start_date=0001-01-01&end_date=0001-01-01",
    "start_date=2025-01-01&end_date=2026-01-02", "preset=last_14_days", "preset=demo",
    "preset=last_7_days&start_date=2026-09-01&end_date=2026-09-30", "preset=last_30_days&start_date=2026-09-01",
    "store_id=00000000-0000-0000-0000-000000000000", "organization_id=00000000-0000-0000-0000-000000000000",
    "unexpected=true",
])
def test_analytics_rejects_invalid_ranges_and_tenant_selectors_without_database(query):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    with TestClient(application) as client:
        assert client.get(f"{ENDPOINT}?{query}").status_code == 422


def test_analytics_maximum_inclusive_range_is_366_days(finance_client, finance_store):
    body = get_analytics(finance_client, date(2024, 1, 1), date(2024, 12, 31))
    assert len(body["daily"]) == 366
    assert body["daily"][59]["date"] == "2024-02-29"
    response = finance_client.get(ENDPOINT, params={"start_date": "2024-01-01", "end_date": "2025-01-01"})
    assert response.status_code == 422


def test_analytics_missing_database_returns_error_without_fabricated_metrics(monkeypatch):
    settings = Settings(database_url=None, migration_database_url=None, _env_file=None)
    monkeypatch.setattr(database_session, "get_settings", lambda: settings)
    database_session.get_engine.cache_clear()
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as client:
            response = client.get(ENDPOINT)
        assert response.status_code == 503
        assert response.json()["code"] == "database_not_configured"
        assert "summary" not in response.json()
    finally:
        database_session.get_engine.cache_clear()


def test_queries_are_bounded_by_request_not_days_or_product_count(finance_client, seeded_session):
    connection = seeded_session.connection()
    counts = []
    for days in (7, 90, 366):
        statements = []

        def collect(_connection, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith(("SELECT", "WITH")):
                statements.append(statement)

        event.listen(connection, "before_cursor_execute", collect)
        try:
            get_analytics(finance_client, DAY, DAY + timedelta(days=days - 1))
        finally:
            event.remove(connection, "before_cursor_execute", collect)
        counts.append(len(statements))
    assert all(1 <= count <= 10 for count in counts), counts
    assert max(counts) - min(counts) <= 1, counts


def test_invalid_refund_history_fails_the_entire_analytics_snapshot(
    finance_client, add_sale, add_refund,
):
    _, item = add_sale()
    add_refund(item, amount="121")
    response = finance_client.get(ENDPOINT, params={"start_date": DAY.isoformat(), "end_date": DAY.isoformat()})
    assert response.status_code == 503
    assert response.json()["code"] == "invalid_financial_history"
    assert "SQL" not in response.text
