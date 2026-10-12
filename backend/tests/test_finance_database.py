"""Finance persistence/API tests on a freshly migrated, isolated PostgreSQL DB."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.db import session as database_session
from app.db.demo import DEMO_ORGANIZATION_ID, DEMO_STORE_ID
from app.db.models import AdSpend, DailyTraffic, Expense, Order, OrderItem, Organization, Product, Refund, Store
from app.db.session import DatabaseError
from app.main import create_app
from app.repositories.finance import financial_inputs
from app.services.dashboard import DashboardService
from app.services.financial_reporting import FinanceService

D = Decimal
DAY = date(2026, 9, 1)
AT = datetime(2026, 9, 1, 12, tzinfo=timezone.utc)


@pytest.fixture
def finance_store(db_session):
    organization = Organization(id=DEMO_ORGANIZATION_ID, name="Finance test organization", is_demo=True)
    db_session.add(organization)
    db_session.flush()
    store = Store(id=DEMO_STORE_ID, organization_id=organization.id, name="Finance test store",
                  currency="USD", timezone="UTC", is_demo=True)
    db_session.add(store)
    db_session.flush()
    product = Product(id=uuid4(), store_id=store.id, sku="FINANCE", name="Historical snapshot test",
                      selling_price=D("999"), unit_cost=D("999"), vat_rate=D("99"), stock_quantity=100)
    db_session.add(product)
    db_session.flush()
    return SimpleNamespace(organization=organization, store=store, product=product)


@pytest.fixture
def add_sale(db_session, finance_store):
    def add(*, at=AT, status="completed", quantity=1, price="120", discount="0", cost="40", vat="20",
            includes_vat=True, shipping="0", shipping_vat="20", shipping_includes_vat=True,
            store=None, product=None):
        store = store or finance_store.store
        product = product or finance_store.product
        order = Order(id=uuid4(), store_id=store.id, order_number=f"finance-{uuid4()}", order_date=at,
                      status=status, shipping_amount=None if shipping is None else D(shipping),
                      shipping_vat_rate=None if shipping_vat is None else D(shipping_vat),
                      shipping_price_includes_vat=shipping_includes_vat)
        db_session.add(order)
        db_session.flush()
        item = OrderItem(id=uuid4(), store_id=store.id, order_id=order.id, product_id=product.id,
                         quantity=quantity, unit_price=D(price), discount_amount=D(discount),
                         vat_rate=D(vat), unit_cost_snapshot=D(cost), price_includes_vat=includes_vat)
        db_session.add(item)
        db_session.flush()
        return order, item
    return add


@pytest.fixture
def add_refund(db_session):
    def add(item, *, at=AT, amount="120", returned=1, restocked=1, includes_vat=True, status="completed"):
        record = Refund(id=uuid4(), store_id=item.store_id, order_item_id=item.id, refund_date=at,
                        amount=D(amount), amount_includes_vat=includes_vat, quantity_returned=returned,
                        quantity_restocked=restocked, status=status)
        db_session.add(record)
        db_session.flush()
        return record
    return add


@pytest.fixture
def finance_client(db_session):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: db_session
    with TestClient(application, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def finance_case(db_session, finance_store, add_sale, add_refund):
    order_a, item_a = add_sale(quantity=2, discount="24", shipping="12", status="partially_refunded")
    order_b, item_b = add_sale(price="100", discount="10", cost="30", vat="10", includes_vat=False)
    refund_a = add_refund(item_a, amount="54")
    for category, amount in [
        ("employee_costs", "50"), ("rent", "20"), ("shipping", "8"),
        ("platform_fees", "2"), ("software", "3"), ("miscellaneous", "2"), ("advertising", "999"),
    ]:
        db_session.add(Expense(store_id=DEMO_STORE_ID, category=category, amount=D(amount), expense_date=DAY,
                               description="Independent financial test fixture"))
    db_session.add(AdSpend(store_id=DEMO_STORE_ID, platform="Test", campaign_name="Authoritative campaign",
                           amount=D("10"), spend_date=DAY))
    db_session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=DAY, visitors=100, sessions=120))
    db_session.flush()
    return SimpleNamespace(**vars(finance_store), order_a=order_a, item_a=item_a,
                           order_b=order_b, item_b=item_b, refund_a=refund_a)


def get_report(client, start=DAY, end=DAY):
    return client.get("/api/finance/summary", params={"start_date": start.isoformat(), "end_date": end.isoformat()})


def test_database_financial_example_uses_historical_values_and_independent_expected_totals(db_session, finance_case):
    result = FinanceService(db_session).get_summary(DAY, DAY)
    expected = {
        "gross_sales": "300.00", "discounts": "30.00", "vat_exclusive_sales_revenue": "270.00",
        "customer_shipping_revenue": "10.00", "vat_collected_sales": "47.00", "refunds": "45.00",
        "vat_refunded": "9.00", "net_vat_collected": "38.00", "revenue": "235.00",
        "net_sales_revenue": "235.00", "cogs_before_returns": "110.00", "cogs_reversed": "40.00",
        "cogs": "70.00", "gross_profit": "165.00", "gross_profit_margin": "70.21",
        "operating_expenses": "85.00", "advertising_expenditure": "10.00", "total_expenses": "95.00",
        "operating_profit": "70.00", "operating_profit_margin": "29.79",
        "contribution_profit": "145.00", "contribution_margin": "61.70",
        "average_order_value": "117.50", "conversion_rate": "2.00",
    }
    for key, amount in expected.items():
        assert getattr(result, key) == D(amount), key
    assert result.break_even_order_quantity == 2
    assert result.order_count == 2 and result.visitors == 100
    assert result.data_completeness.is_complete
    assert result.currency == "USD"
    assert result.store_id == DEMO_STORE_ID


def test_api_returns_database_finance_as_decimal_strings(finance_client, finance_case, db_session):
    response = get_report(finance_client)
    assert response.status_code == 200
    body = response.json()
    assert body["revenue"] == "235.00"
    assert body["gross_profit"] == "165.00"
    assert body["operating_profit"] == "70.00"
    assert body["conversion_rate"] == "2.00"
    assert body["reporting_period"] == {"start": "2026-09-01", "end": "2026-09-01"}
    assert body["data_source"]["type"] == "database_demo"
    assert body["data_completeness"]["is_complete"] is True
    db_session.add(Expense(store_id=DEMO_STORE_ID, category="rent", amount=D("1.23"), expense_date=DAY,
                           description="Prove the endpoint rereads the database"))
    db_session.flush()
    assert get_report(finance_client).json()["operating_profit"] == "68.77"


def test_cancelled_pending_orders_and_refunds_are_excluded(db_session, finance_case, add_sale, add_refund):
    for status in ("cancelled", "pending"):
        _, ignored_item = add_sale(status=status, price="99999", shipping="9999")
        add_refund(ignored_item, amount="99999")
        add_refund(finance_case.item_a, status=status, amount="99999", returned=99, restocked=99)
    result = FinanceService(db_session).get_summary(DAY, DAY)
    assert result.order_count == 2
    assert result.revenue == D("235.00")
    assert result.refunds == D("45.00")
    assert result.cogs == D("70.00")
    assert result.data_completeness.is_complete


@pytest.mark.parametrize("status", ["completed", "partially_refunded", "refunded", "returned"])
def test_recognized_order_statuses_preserve_sales_and_apply_posted_refunds(db_session, add_sale, add_refund, status):
    _, item = add_sale(status=status)
    add_refund(item)
    result = FinanceService(db_session).get_summary(DAY, DAY)
    assert result.order_count == 1
    assert result.gross_sales == D("100.00")
    assert result.refunds == D("100.00")
    assert result.revenue == D("0.00")
    assert result.cogs == D("0.00")
    assert result.data_completeness.missing_refund_orders == 0


def test_product_catalog_edits_do_not_change_historical_finance(db_session, finance_case):
    before = FinanceService(db_session).get_summary(DAY, DAY).model_dump()
    finance_case.product.selling_price = D("1.00")
    finance_case.product.unit_cost = D("0.01")
    finance_case.product.vat_rate = D("0.00")
    db_session.flush()
    db_session.expire_all()
    assert FinanceService(db_session).get_summary(DAY, DAY).model_dump() == before


def test_refund_is_recognized_on_its_event_date_and_can_make_period_negative(db_session, add_sale, add_refund):
    tomorrow = DAY + timedelta(days=1)
    _, item = add_sale(status="returned")
    add_refund(item, at=AT + timedelta(days=1))
    db_session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=tomorrow, visitors=0, sessions=0))
    db_session.flush()
    earlier = FinanceService(db_session).get_summary(DAY, DAY)
    assert earlier.revenue == D("100.00")
    assert earlier.refunds == D("0.00")
    assert earlier.cogs == D("40.00")
    later = FinanceService(db_session).get_summary(tomorrow, tomorrow)
    assert later.order_count == 0
    assert later.revenue == D("-100.00")
    assert later.cogs_before_returns == D("0.00")
    assert later.cogs == D("-40.00")
    assert later.gross_profit == D("-60.00")
    assert later.net_vat_collected == D("-20.00")
    assert later.average_order_value is None
    assert later.operating_profit_margin is None
    assert later.conversion_rate == D("0.00")


def test_store_timezone_dst_day_uses_inclusive_start_exclusive_end_for_sales_and_refunds(
    db_session, finance_store, add_sale, add_refund,
):
    finance_store.store.timezone = "America/New_York"
    day = date(2026, 11, 1)
    start = datetime(2026, 11, 1, 4, tzinfo=timezone.utc)
    end = datetime(2026, 11, 2, 5, tzinfo=timezone.utc)
    _, historical_item = add_sale(at=start - timedelta(days=10), quantity=10)
    for timestamp in (start - timedelta(microseconds=1), start, end - timedelta(microseconds=1), end):
        add_sale(at=timestamp)
        add_refund(historical_item, at=timestamp, amount="12", returned=0, restocked=0)
    for expense_day, amount in [(day - timedelta(days=1), "999"), (day, "7"), (day + timedelta(days=1), "999")]:
        db_session.add(Expense(store_id=DEMO_STORE_ID, category="rent", amount=D(amount), expense_date=expense_day,
                               description="Timezone boundary expense"))
        db_session.add(AdSpend(store_id=DEMO_STORE_ID, platform="Test", campaign_name="Boundary campaign",
                               amount=D(amount), spend_date=expense_day))
        db_session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=expense_day, visitors=int(amount), sessions=int(amount)))
    db_session.flush()
    result = FinanceService(db_session).get_summary(day, day)
    assert result.order_count == 2
    assert result.vat_exclusive_sales_revenue == D("200.00")
    assert result.refunds == D("20.00")
    assert result.revenue == D("180.00")
    assert result.cogs == D("80.00")
    assert result.operating_expenses == D("7.00")
    assert result.advertising_expenditure == D("7.00")
    assert result.visitors == 7
    assert result.data_completeness.is_complete


@pytest.mark.parametrize("source", ["sales_vat", "shipping_amount", "shipping_vat", "refund_vat", "restock"])
def test_unknown_historical_financial_fields_return_null_and_completeness_warnings(
    db_session, finance_client, finance_case, source,
):
    if source == "sales_vat":
        finance_case.item_a.price_includes_vat = None
    elif source == "shipping_amount":
        finance_case.order_a.shipping_amount = None
    elif source == "shipping_vat":
        finance_case.order_a.shipping_price_includes_vat = None
    elif source == "refund_vat":
        finance_case.refund_a.amount_includes_vat = None
    else:
        finance_case.refund_a.quantity_restocked = None
    db_session.flush()
    response = get_report(finance_client)
    assert response.status_code == 200
    body = response.json()
    assert body["operating_profit"] is None
    assert body["gross_profit"] is None
    assert body["break_even_order_quantity"] is None
    assert body["data_completeness"]["is_complete"] is False
    assert body["data_completeness"]["warnings"]
    if source == "restock":
        assert body["revenue"] == "235.00"
        assert body["cogs"] is None
        assert body["data_completeness"]["missing_restock_refunds"] == 1
    else:
        assert body["revenue"] is None


def test_refund_of_older_unknown_basis_sale_warns_even_with_known_current_refund(
    db_session, finance_store, add_sale, add_refund,
):
    _, item = add_sale(at=AT - timedelta(days=2), includes_vat=None)
    add_refund(item, at=AT, amount="12", returned=0, restocked=0)
    db_session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=DAY, visitors=0, sessions=0))
    db_session.flush()
    result = FinanceService(db_session).get_summary(DAY, DAY)
    assert result.revenue == D("-10.00")
    assert result.vat_refunded == D("2.00")
    assert result.data_completeness.is_complete is False
    assert any("cash limits" in warning for warning in result.data_completeness.warnings)


def test_returned_status_without_ledger_flags_later_reports_without_inventing_amounts(
    db_session, finance_store, add_sale, add_refund,
):
    _, item = add_sale(at=AT - timedelta(days=10), status="returned")
    add_refund(item, status="pending")
    report = FinanceService(db_session).get_summary(DAY, DAY)
    assert report.order_count == 0
    assert report.refunds is report.revenue is report.cogs_reversed is report.operating_profit is None
    assert report.data_completeness.missing_refund_orders == 1


def test_recognized_order_without_items_is_incomplete(db_session, finance_store):
    db_session.add(Order(store_id=DEMO_STORE_ID, order_number="missing-item", order_date=AT, status="completed",
                         shipping_amount=D("0"), shipping_vat_rate=D("0"), shipping_price_includes_vat=False))
    db_session.flush()
    result = FinanceService(db_session).get_summary(DAY, DAY)
    assert result.order_count == 1
    assert result.revenue is result.cogs is result.gross_profit is None
    assert result.data_completeness.missing_order_items == 1


def test_empty_period_returns_zero_money_null_ratios_and_missing_traffic_warning(finance_client, finance_store):
    response = get_report(finance_client)
    assert response.status_code == 200
    body = response.json()
    assert body["revenue"] == body["cogs"] == body["operating_profit"] == "0.00"
    assert body["order_count"] == body["visitors"] == 0
    assert body["conversion_rate"] is body["average_order_value"] is body["gross_profit_margin"] is None
    assert body["data_completeness"]["is_complete"] is False
    assert body["data_completeness"]["traffic_days"] == 0


def test_full_seed_finance_preserves_common_legacy_metrics(seeded_session):
    finance = FinanceService(seeded_session).get_summary()
    legacy = DashboardService(seeded_session).get_summary()
    for name in ("revenue", "operating_expenses", "advertising_expenditure", "total_expenses", "conversion_rate"):
        assert getattr(finance, name) == getattr(legacy, name), name
    assert finance.order_count == legacy.total_orders
    assert finance.visitors == legacy.total_visitors
    assert finance.gross_profit < finance.revenue
    assert finance.data_completeness.is_complete


def test_finance_api_cannot_see_other_store_transactions(finance_client, finance_case, db_session, add_sale, add_refund):
    before = get_report(finance_client).json()
    other = Store(id=uuid4(), organization_id=DEMO_ORGANIZATION_ID, name="Other confidential store",
                  currency="EUR", timezone="UTC", is_demo=True)
    db_session.add(other)
    db_session.flush()
    other_product = Product(id=uuid4(), store_id=other.id, sku="PRIVATE", name="Private item", selling_price=D("999999"),
                            unit_cost=D("999"), vat_rate=D("20"), stock_quantity=100)
    db_session.add(other_product)
    db_session.flush()
    _, item = add_sale(store=other, product=other_product, price="999999", shipping="999")
    add_refund(item)
    db_session.add(Expense(store_id=other.id, category="rent", amount=D("999999"), expense_date=DAY, description="Private expense"))
    db_session.add(AdSpend(store_id=other.id, platform="Private", campaign_name="Private", amount=D("999999"), spend_date=DAY))
    db_session.add(DailyTraffic(store_id=other.id, date=DAY, visitors=999999, sessions=999999))
    db_session.flush()
    assert get_report(finance_client).json() == before


@pytest.mark.parametrize("flag", ["store", "organization"])
def test_finance_api_requires_both_demo_flags(finance_client, finance_case, db_session, flag):
    getattr(finance_case, flag).is_demo = False
    db_session.flush()
    response = get_report(finance_client)
    assert response.status_code == 404
    assert response.json()["code"] == "demo_store_not_seeded"


def test_finance_api_requires_configured_demo_organization(finance_client, finance_case, db_session):
    organization = Organization(id=uuid4(), name="Other demo organization", is_demo=True)
    db_session.add(organization)
    db_session.flush()
    finance_case.store.organization_id = organization.id
    db_session.flush()
    assert get_report(finance_client).status_code == 404


def test_database_rejects_refund_linked_to_a_different_store_item(db_session, finance_case):
    other = Store(id=uuid4(), organization_id=DEMO_ORGANIZATION_ID, name="Other store", currency="USD", timezone="UTC", is_demo=False)
    db_session.add(other)
    db_session.flush()
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.add(Refund(store_id=other.id, order_item_id=finance_case.item_a.id, refund_date=AT,
                              amount=D("1"), amount_includes_vat=False, quantity_returned=0,
                              quantity_restocked=0, status="completed"))
        db_session.flush()


@pytest.mark.parametrize("violation", ["quantity", "amount"])
def test_cumulative_invalid_refund_history_across_periods_is_rejected(
    db_session, finance_client, finance_store, add_sale, add_refund, violation,
):
    _, item = add_sale(at=AT - timedelta(days=3))
    for timestamp in (AT - timedelta(days=2), AT):
        add_refund(item, at=timestamp, amount="1" if violation == "quantity" else "60",
                   returned=1 if violation == "quantity" else 0,
                   restocked=1 if violation == "quantity" else 0, includes_vat=False)
    with pytest.raises(DatabaseError) as error:
        financial_inputs(db_session, finance_store.store, DAY, DAY)
    assert error.value.code == "invalid_financial_history"
    response = get_report(finance_client)
    assert response.status_code == 503
    assert response.json()["code"] == "invalid_financial_history"
    assert "SQL" not in response.text


@pytest.mark.parametrize("query", [
    "start_date=2026-09-01", "end_date=2026-09-30", "start_date=bad&end_date=bad",
    "start_date=2026-09-30&end_date=2026-09-01", "start_date=9999-12-31&end_date=9999-12-31",
    "store_id=00000000-0000-0000-0000-000000000000", "organization_id=00000000-0000-0000-0000-000000000000",
    "unexpected=true",
])
def test_finance_api_rejects_invalid_periods_and_tenant_selectors_without_database(query):
    application = create_app()
    application.dependency_overrides[database_session.get_db_session] = lambda: None
    with TestClient(application) as client:
        assert client.get(f"/api/finance/summary?{query}").status_code == 422


def test_finance_api_missing_database_returns_503_without_mock_fallback(monkeypatch):
    settings = Settings(database_url=None, migration_database_url=None, _env_file=None)
    monkeypatch.setattr(database_session, "get_settings", lambda: settings)
    database_session.get_engine.cache_clear()
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as client:
            response = client.get("/api/finance/summary")
        assert response.status_code == 503
        assert response.json()["code"] == "database_not_configured"
        assert "revenue" not in response.json()
    finally:
        database_session.get_engine.cache_clear()


@pytest.mark.parametrize("report_day", [DAY - timedelta(days=1), DAY])
def test_finance_api_rejects_refund_before_original_order_in_current_or_full_history(
    finance_client, add_sale, add_refund, report_day,
):
    _, item = add_sale(status="partially_refunded")
    add_refund(item, at=AT - timedelta(days=1), amount="10", returned=0, restocked=0)
    # This valid event makes the same item relevant to a later report, which
    # must still reject the impossible earlier event in its complete ledger.
    add_refund(item, at=AT + timedelta(minutes=1), amount="10", returned=0, restocked=0)
    response = get_report(finance_client, report_day, report_day)
    assert response.status_code == 503
    assert response.json()["code"] == "invalid_financial_history"
    assert "SQL" not in response.text


def test_finance_api_accepts_full_split_cash_refund_with_documented_credit_note_rounding(
    db_session, finance_client, add_sale, add_refund,
):
    _, item = add_sale(price="1.00", cost="0.20", vat="20", includes_vat=True, status="refunded")
    add_refund(item, at=AT + timedelta(minutes=1), amount="0.50", returned=0, restocked=0)
    add_refund(item, at=AT + timedelta(minutes=2), amount="0.50", returned=1, restocked=1)
    db_session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=DAY, visitors=1, sessions=1))
    db_session.flush()
    response = get_report(finance_client)
    assert response.status_code == 200
    body = response.json()
    # Each credit note rounds independently: 0.50 / 1.20 -> 0.42 exclusive,
    # whereas the original 1.00 invoice had 0.83 exclusive and 0.17 VAT.
    expected = {
        "gross_sales": "0.83", "vat_exclusive_sales_revenue": "0.83",
        "vat_collected_sales": "0.17", "refunds": "0.84", "vat_refunded": "0.16",
        "net_vat_collected": "0.01", "net_sales_revenue": "-0.01", "revenue": "-0.01",
        "cogs_before_returns": "0.20", "cogs_reversed": "0.20", "cogs": "0.00",
        "gross_profit": "-0.01", "operating_profit": "-0.01",
    }
    for key, amount in expected.items():
        assert body[key] == amount, key
    assert body["data_completeness"]["is_complete"] is True
