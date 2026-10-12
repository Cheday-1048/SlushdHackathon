"""Forward-only Phase 03 migration and storage integrity regression tests."""

import importlib.util
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import MetaData, create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import NullPool

from app.db.demo import DEMO_ORGANIZATION_ID, DEMO_STORE_ID
from app.db.models import Order, OrderItem, Refund
from app.seed import build_seed_data, seed_database
from conftest import checked_test_url, migration_config


@pytest.fixture
def phase02_engine():
    """Own an isolated database at revision 0001; never modify the entry DB."""
    value = os.environ.get("TEST_DATABASE_URL")
    if not value:
        pytest.skip("Set TEST_DATABASE_URL to a local rdl_test_* database")
    url = checked_test_url(value)
    name = f"rdl_test_{uuid4().hex}"
    args = {"connect_timeout": 5, "hostaddr": "::1" if url.host == "::1" else "127.0.0.1"}
    admin = create_engine(url, isolation_level="AUTOCOMMIT", poolclass=NullPool, connect_args=args)
    engine = None
    created = False
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        created = True
        engine = create_engine(url.set(database=name), poolclass=NullPool, connect_args=args)
        with engine.begin() as connection:
            command.upgrade(migration_config(connection), "0001_retail_schema")
        yield engine
    finally:
        if engine is not None:
            engine.dispose()
        if created:
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{name}"'))
        admin.dispose()


def insert_phase02_seed(connection):
    """Insert legacy columns through reflected tables, avoiding the new ORM."""
    legacy = MetaData(schema="retail")
    legacy.reflect(bind=connection)
    for model, rows in build_seed_data().items():
        table = legacy.tables[f"retail.{model.__tablename__}"]
        connection.execute(table.insert(), [{key: value for key, value in row.items() if key in table.c} for row in rows])
    return legacy


def test_migration_preserves_every_legacy_value_and_backfills_only_known_demo_rows(phase02_engine):
    with phase02_engine.begin() as connection:
        legacy = insert_phase02_seed(connection)
        orders = legacy.tables["retail.orders"]
        items = legacy.tables["retail.order_items"]
        unknown_order = dict(connection.execute(select(orders).limit(1)).mappings().one())
        unknown_order.update(id=uuid4(), order_number="MANUALLY-IMPORTED-UNKNOWN")
        connection.execute(orders.insert(), unknown_order)
        unknown_item = dict(connection.execute(select(items).limit(1)).mappings().one())
        unknown_item.update(id=uuid4(), order_id=unknown_order["id"])
        connection.execute(items.insert(), unknown_item)
        # Every old column, including an operator edit, must be preserved.
        connection.execute(text("UPDATE retail.products SET name = 'Preserved operator edit' WHERE sku = 'DEMO-MUG-01'"))
        previous = {
            name: connection.execute(select(table).order_by(table.c.id)).mappings().all()
            for name, table in legacy.tables.items() if "id" in table.c
        }
        command.upgrade(migration_config(connection), "head")
        command.upgrade(migration_config(connection), "head")
        for name, table in legacy.tables.items():
            if name in previous:
                assert connection.execute(select(table).order_by(table.c.id)).mappings().all() == previous[name]
        assert connection.scalar(text("SELECT count(*) FROM retail.order_items WHERE price_includes_vat = false")) == 660
        assert connection.scalar(text("SELECT count(*) FROM retail.orders WHERE shipping_amount = 0 AND shipping_vat_rate = 0 AND shipping_price_includes_vat = false")) == 377
        assert connection.scalar(text("SELECT price_includes_vat FROM retail.order_items WHERE id = :id"), {"id": unknown_item["id"]}) is None
        unknown_shipping = connection.execute(text("SELECT shipping_amount, shipping_vat_rate, shipping_price_includes_vat FROM retail.orders WHERE id = :id"), {"id": unknown_order["id"]}).one()
        assert tuple(unknown_shipping) == (None, None, None)
        assert connection.scalar(text("SELECT count(*) FROM retail.refunds")) == 0
        assert connection.scalar(text("SELECT version_num FROM retail.alembic_version")) == "0002_financial_snapshots"


@pytest.mark.parametrize("not_demo_table", ["organizations", "stores"])
def test_backfill_requires_both_synthetic_flags(phase02_engine, not_demo_table):
    with phase02_engine.begin() as connection:
        legacy = insert_phase02_seed(connection)
        table = legacy.tables[f"retail.{not_demo_table}"]
        identifier = DEMO_ORGANIZATION_ID if not_demo_table == "organizations" else DEMO_STORE_ID
        connection.execute(table.update().where(table.c.id == identifier).values(is_demo=False))
        command.upgrade(migration_config(connection), "head")
        assert connection.scalar(text("SELECT count(*) FROM retail.order_items WHERE price_includes_vat IS NOT NULL")) == 0
        assert connection.scalar(text("SELECT count(*) FROM retail.orders WHERE shipping_amount IS NOT NULL")) == 0


def test_forward_migration_matches_current_metadata(postgres_engine):
    with postgres_engine.begin() as connection:
        command.check(migration_config(connection))
        columns = {row["name"]: row for row in inspect(connection).get_columns("order_items", schema="retail")}
        assert columns["price_includes_vat"]["nullable"]


def test_frozen_migration_seed_identities_match_known_v1_fixture():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/0002_financial_snapshots.py"
    spec = importlib.util.spec_from_file_location("phase03_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _, orders, items = module._phase02_seed_ids()
    rows = build_seed_data()
    assert len(orders) == 377 and len(items) == 660
    assert set(orders) == {row["id"] for row in rows[Order]}
    assert set(items) == {row["id"] for row in rows[OrderItem]}
    with pytest.raises(RuntimeError, match="destructive downgrades are disabled"):
        module.downgrade()


def refund_values(session):
    item = session.scalars(select(OrderItem)).first()
    return dict(
        store_id=item.store_id, order_item_id=item.id,
        refund_date=datetime(2026, 9, 20, tzinfo=timezone.utc), amount=Decimal("1.00"),
        amount_includes_vat=False, quantity_returned=1, quantity_restocked=0,
    )


@pytest.mark.parametrize("change", [
    {"store_id": uuid4()}, {"order_item_id": uuid4()}, {"amount": Decimal("-0.01")},
    {"quantity_returned": -1}, {"quantity_restocked": -1},
    {"quantity_restocked": 2}, {"status": "invented"},
])
def test_refund_storage_rejects_invalid_values_and_cross_store_links(seeded_session, change):
    values = refund_values(seeded_session)
    with pytest.raises(IntegrityError), seeded_session.begin_nested():
        seeded_session.add(Refund(**{**values, **change}))
        seeded_session.flush()


def test_refund_unknown_basis_and_restocking_remain_explicit_null(seeded_session):
    values = refund_values(seeded_session)
    refund = Refund(**{**values, "amount_includes_vat": None, "quantity_restocked": None})
    seeded_session.add(refund)
    seeded_session.flush()
    seeded_session.refresh(refund)
    assert refund.amount_includes_vat is None and refund.quantity_restocked is None
    assert refund.status == "completed"
    assert refund in refund.order_item.refunds
    assert refund.order_item.store_id == refund.store_id


def test_reseeding_preserves_explicit_financial_metadata_edits(seeded_session):
    order = seeded_session.scalars(select(Order)).first()
    item = order.items[0]
    assert order.shipping_amount == 0 and item.price_includes_vat is False
    order.shipping_amount = Decimal("5.00")
    order.shipping_vat_rate = Decimal("20.00")
    order.shipping_price_includes_vat = True
    item.price_includes_vat = True
    seeded_session.flush()
    assert not any(seed_database(seeded_session).values())
    seeded_session.refresh(order)
    seeded_session.refresh(item)
    assert order.shipping_amount == Decimal("5.00")
    assert order.shipping_price_includes_vat is True
    assert item.price_includes_vat is True


@pytest.mark.parametrize("change", [
    {"shipping_amount": Decimal("-0.01")}, {"shipping_vat_rate": Decimal("100.01")},
    {"shipping_vat_rate": Decimal("-0.01")},
])
def test_order_shipping_constraints(seeded_session, change):
    order = seeded_session.scalars(select(Order)).first()
    with pytest.raises(IntegrityError), seeded_session.begin_nested():
        for key, value in change.items():
            setattr(order, key, value)
        seeded_session.flush()
