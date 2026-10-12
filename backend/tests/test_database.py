from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import Date, cast, func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.db.demo import DEMO_ORGANIZATION_ID, DEMO_PERIOD_END, DEMO_PERIOD_START, DEMO_STORE_ID
from app.db.models import AdSpend, DailyTraffic, Expense, Order, OrderItem, Organization, Product, Store
from app.seed import seed_database
from app.services.dashboard import DashboardService
from conftest import checked_test_url, migration_config


@pytest.mark.parametrize("url", [
    "postgresql://user:password@production.example/rdl_test_demo",
    "postgresql://user:password@127.0.0.1/production",
    "postgresql://user:password@localhost/postgres",
    "sqlite:///rdl_test_demo",
    "postgresql:///rdl_test_demo",
    "postgresql://user:password@localhost/rdl_test_demo?host=production.example",
    "postgresql://user:password@localhost/rdl_test_demo?hostaddr=203.0.113.1",
    "postgresql://user:password@localhost/rdl_test_demo?dbname=production",
    "postgresql://user:password@localhost/rdl_test_demo?service=shared-production",
])
def test_test_database_guard_rejects_unsafe_destinations(url):
    with pytest.raises(ValueError):
        checked_test_url(url)


def test_postgres_connectivity_and_migration_rerun(postgres_engine):
    with postgres_engine.begin() as connection:
        assert connection.scalar(text("SELECT current_database()" )).startswith("rdl_test_")
        assert connection.scalar(text("SELECT version()" )).startswith("PostgreSQL")
        before = set(inspect(connection).get_table_names(schema="retail"))
        command.upgrade(migration_config(connection), "head")
        command.upgrade(migration_config(connection), "head")
        assert set(inspect(connection).get_table_names(schema="retail")) == before
        assert {
            "organizations", "stores", "products", "orders", "order_items",
            "expenses", "daily_traffic", "ad_spend",
        } <= before


def test_seed_relationships_and_thirty_days(seeded_session):
    session = seeded_session
    organization = session.get(Organization, DEMO_ORGANIZATION_ID)
    store = session.get(Store, DEMO_STORE_ID)
    assert organization.is_demo and store.is_demo
    assert store.organization == organization
    assert store in organization.stores
    assert 10 <= len(store.products) <= 15
    assert len(store.daily_traffic) == 30
    assert {row.date for row in store.daily_traffic} == {
        DEMO_PERIOD_START + timedelta(days=offset) for offset in range(30)
    }
    order_dates = set(session.scalars(select(cast(Order.order_date, Date)).distinct()))
    assert order_dates == {row.date for row in store.daily_traffic}
    assert all(order.order_date.tzinfo is not None and order.items for order in store.orders)
    assert all(item.product in store.products and item.order == order for order in store.orders for item in order.items)
    assert all(item in item.product.order_items for order in store.orders for item in order.items)
    assert all(row.store == store and row.sessions >= row.visitors for row in store.daily_traffic)
    assert all(row.store == store for row in store.expenses + store.ad_spend)
    assert {row.category for row in store.expenses} >= {"employee_costs", "rent", "shipping", "software"}
    sales = Counter(item.product_id for order in store.orders for item in order.items)
    assert len(set(sales.values())) > 1


def test_seed_is_idempotent_and_preserves_existing_records(seeded_session):
    session = seeded_session
    models = (Organization, Store, Product, Order, OrderItem, Expense, DailyTraffic, AdSpend)
    counts = {model: session.scalar(select(func.count()).select_from(model)) for model in models}
    before = DashboardService(session).get_summary().model_dump()
    product = session.scalars(select(Product).order_by(Product.sku)).first()
    product.name = "An intentional operator edit"
    session.flush()
    seed_database(session)
    session.flush()
    assert {model: session.scalar(select(func.count()).select_from(model)) for model in models} == counts
    assert DashboardService(session).get_summary().model_dump() == before
    assert session.get(Product, product.id).name == "An intentional operator edit"


def test_dashboard_aggregates_stored_transactions_without_counting_ads_twice(seeded_session):
    session = seeded_session
    store = session.get(Store, DEMO_STORE_ID)
    completed = [order for order in store.orders if order.status == "completed"]
    expected_revenue = sum(
        (item.quantity * item.unit_price - item.discount_amount for order in completed for item in order.items),
        Decimal("0.00"),
    )
    operating = sum((row.amount for row in store.expenses if row.category != "advertising"), Decimal("0.00"))
    advertising = sum((row.amount for row in store.ad_spend), Decimal("0.00"))
    visitors = sum(row.visitors for row in store.daily_traffic)
    summary = DashboardService(session).get_summary()
    assert summary.revenue == expected_revenue
    assert summary.total_orders == len(completed)
    assert summary.total_visitors == visitors
    assert summary.conversion_rate == (Decimal(len(completed)) / Decimal(visitors) * 100).quantize(Decimal("0.01"))
    assert summary.operating_expenses == operating
    assert summary.advertising_expenditure == advertising
    assert summary.total_expenses == operating + advertising
    assert summary.reporting_period.start == DEMO_PERIOD_START
    assert summary.reporting_period.end == DEMO_PERIOD_END
    assert summary.data_source.type == "database_demo"
    # A bookkeeping advertising expense must not duplicate the campaign ledger.
    session.add(Expense(store_id=DEMO_STORE_ID, category="advertising", amount=Decimal("123.45"),
                        expense_date=DEMO_PERIOD_START, description="Synthetic campaign bookkeeping mirror"))
    session.flush()
    assert DashboardService(session).get_summary().total_expenses == summary.total_expenses


def test_financial_values_use_decimal_and_snapshots_survive_catalog_changes(seeded_session):
    session = seeded_session
    item = session.scalars(select(OrderItem)).first()
    assert isinstance(item.unit_price, Decimal)
    assert isinstance(item.unit_cost_snapshot, Decimal)
    assert isinstance(item.product.selling_price, Decimal)
    previous = (item.unit_price, item.unit_cost_snapshot, item.vat_rate)
    original_revenue = DashboardService(session).get_summary().revenue
    item.product.selling_price = Decimal("999.99")
    item.product.unit_cost = Decimal("111.11")
    item.product.vat_rate = Decimal("17.25")
    session.flush()
    session.expire_all()
    assert (item.unit_price, item.unit_cost_snapshot, item.vat_rate) == previous
    assert DashboardService(session).get_summary().revenue == original_revenue
    expense = Expense(store_id=DEMO_STORE_ID, category="miscellaneous", amount=Decimal("0.10"),
                      expense_date=DEMO_PERIOD_START, description="Synthetic precision test")
    session.add(expense)
    session.flush()
    session.refresh(expense)
    assert expense.amount == Decimal("0.10")
    assert expense.amount.as_tuple().exponent == -2


def test_empty_reporting_period_returns_zero_metrics(seeded_session):
    summary = DashboardService(seeded_session).get_summary(start_date=date(2000, 1, 1), end_date=date(2000, 1, 31))
    assert summary.revenue == summary.total_expenses == summary.operating_expenses == summary.advertising_expenditure == Decimal("0")
    assert summary.total_orders == summary.total_visitors == 0
    assert summary.conversion_rate == Decimal("0")
    assert summary.reporting_period.start == date(2000, 1, 1)
    assert summary.reporting_period.end == date(2000, 1, 31)


def test_single_day_period_includes_both_boundaries_and_excludes_other_statuses(seeded_session):
    session = seeded_session
    day = date(2001, 1, 1)
    product = session.scalars(select(Product)).first()
    for number, timestamp, status in [
        ("start", datetime(2001, 1, 1, 0, 0, tzinfo=timezone.utc), "completed"),
        ("end", datetime(2001, 1, 1, 23, 59, 59, 999999, tzinfo=timezone.utc), "completed"),
        ("outside", datetime(2001, 1, 2, 0, 0, tzinfo=timezone.utc), "completed"),
        ("cancelled", datetime(2001, 1, 1, 12, 0, tzinfo=timezone.utc), "cancelled"),
        ("pending", datetime(2001, 1, 1, 12, 0, tzinfo=timezone.utc), "pending"),
    ]:
        order = Order(id=uuid4(), store_id=DEMO_STORE_ID, order_number=f"boundary-{number}", order_date=timestamp, status=status)
        session.add(order)
        session.flush()
        session.add(OrderItem(store_id=DEMO_STORE_ID, order_id=order.id, product_id=product.id, quantity=3,
                              unit_price=Decimal("0.10"), discount_amount=Decimal("0.01"),
                              unit_cost_snapshot=Decimal("0.02"), vat_rate=Decimal("20.00")))
    session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=day, visitors=10, sessions=12))
    session.add(Expense(store_id=DEMO_STORE_ID, category="software", amount=Decimal("0.10"), expense_date=day, description="Synthetic boundary expense"))
    session.add(AdSpend(store_id=DEMO_STORE_ID, platform="Synthetic", campaign_name="Boundary", amount=Decimal("0.20"), spend_date=day))
    session.flush()
    summary = DashboardService(session).get_summary(start_date=day, end_date=day)
    assert summary.revenue == Decimal("0.58")
    assert summary.total_orders == 2
    assert summary.total_visitors == 10
    assert summary.conversion_rate == Decimal("20.00")
    assert summary.total_expenses == Decimal("0.30")


def test_database_rejects_missing_foreign_key(seeded_session):
    with pytest.raises(IntegrityError), seeded_session.begin_nested():
        seeded_session.add(Expense(store_id=uuid4(), category="rent", amount=Decimal("1.00"),
                                   expense_date=DEMO_PERIOD_START, description="Must fail"))
        seeded_session.flush()


def test_database_rejects_cross_store_order_items(seeded_session):
    session = seeded_session
    another_store = Store(id=uuid4(), organization_id=DEMO_ORGANIZATION_ID, name="Isolated synthetic store",
                          currency="USD", timezone="UTC", is_demo=False)
    session.add(another_store)
    session.flush()
    another_product = Product(id=uuid4(), store_id=another_store.id, sku="OTHER", name="Other store item",
                              selling_price=Decimal("1.00"), unit_cost=Decimal("0.50"), vat_rate=Decimal("0.00"), stock_quantity=1)
    session.add(another_product)
    session.flush()
    order = session.scalars(select(Order)).first()
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(OrderItem(store_id=DEMO_STORE_ID, order_id=order.id, product_id=another_product.id, quantity=1,
                              unit_price=Decimal("1.00"), discount_amount=Decimal("0.00"),
                              unit_cost_snapshot=Decimal("0.50"), vat_rate=Decimal("0.00")))
        session.flush()


def test_database_rejects_duplicate_daily_traffic(seeded_session):
    with pytest.raises(IntegrityError), seeded_session.begin_nested():
        seeded_session.add(DailyTraffic(store_id=DEMO_STORE_ID, date=DEMO_PERIOD_START, visitors=1, sessions=1))
        seeded_session.flush()


@pytest.mark.parametrize("values", [
    {"selling_price": Decimal("-0.01")},
    {"unit_cost": Decimal("-0.01")},
    {"vat_rate": Decimal("100.01")},
    {"stock_quantity": -1},
])
def test_database_rejects_invalid_product_values(seeded_session, values):
    product = dict(store_id=DEMO_STORE_ID, sku=f"INVALID-{uuid4()}", name="Invalid synthetic product",
                   selling_price=Decimal("1.00"), unit_cost=Decimal("0.50"), vat_rate=Decimal("0.00"), stock_quantity=1)
    with pytest.raises(IntegrityError), seeded_session.begin_nested():
        seeded_session.add(Product(**{**product, **values}))
        seeded_session.flush()
