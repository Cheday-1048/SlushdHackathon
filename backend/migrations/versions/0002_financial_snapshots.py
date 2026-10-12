"""Add explicit tax basis, customer shipping and dated merchandise refunds.

Revision ID: 0002_financial_snapshots
Revises: 0001_retail_schema

Unknown historical metadata remains NULL. Only the reserved deterministic
Phase 02 synthetic rows are backfilled using their documented tax-exclusive
prices and no customer shipping charge. No transactions or totals are reset.
"""

from datetime import date, timedelta
from random import Random
from uuid import NAMESPACE_URL, uuid5

from alembic import op
import sqlalchemy as sa

revision = "0002_financial_snapshots"
down_revision = "0001_retail_schema"
branch_labels = None
depends_on = None


def _phase02_seed_ids():
    """Frozen v1 identity algorithm; independent of the evolving seed module.

    Product choices and quantities consume random draws even though only the
    item identities are needed. This reproduces precisely the 660 seeded item
    IDs instead of assuming that every order has all three potential lines.
    """
    namespace = uuid5(NAMESPACE_URL, "https://retail-decision-lab.example/synthetic-demo/v1")
    rng = Random(20260901)
    weights = [19, 16, 15, 13, 11, 10, 6, 3, 8, 5, 7, 2]
    order_ids, item_ids = [], []
    sequence = 0
    for day_index in range(30):
        day = date(2026, 9, 1) + timedelta(days=day_index)
        for _ in range(9 + day_index % 6 + (4 if day.weekday() >= 5 else 0)):
            sequence += 1
            number = f"SYN-202609-{sequence:05d}"
            order_ids.append(uuid5(namespace, f"order:{number}"))
            selected = set()
            for line_index in range(rng.choice([1, 1, 2, 2, 3])):
                remaining = [index for index in range(12) if index not in selected]
                selected.add(rng.choices(remaining, weights=[weights[index] for index in remaining], k=1)[0])
                rng.choice([1, 1, 1, 2, 2, 3])
                item_ids.append(uuid5(namespace, f"item:{number}:{line_index}"))
    return namespace, order_ids, item_ids


def _backfill_known_synthetic_rows() -> None:
    namespace, order_ids, item_ids = _phase02_seed_ids()
    organization_id = uuid5(namespace, "organization")
    store_id = uuid5(namespace, "store")
    organizations = sa.table(
        "organizations", sa.column("id", sa.Uuid()), sa.column("is_demo", sa.Boolean()), schema="retail",
    )
    stores = sa.table(
        "stores", sa.column("id", sa.Uuid()), sa.column("organization_id", sa.Uuid()),
        sa.column("is_demo", sa.Boolean()), sa.column("currency", sa.String()),
        sa.column("timezone", sa.String()), schema="retail",
    )
    demo_store = sa.select(stores.c.id).join(
        organizations, stores.c.organization_id == organizations.c.id,
    ).where(
        stores.c.id == store_id, stores.c.organization_id == organization_id,
        stores.c.is_demo.is_(True), organizations.c.is_demo.is_(True),
        stores.c.currency == "USD", stores.c.timezone == "UTC",
    )
    orders = sa.table(
        "orders", sa.column("id", sa.Uuid()), sa.column("store_id", sa.Uuid()),
        sa.column("shipping_amount", sa.Numeric(14, 2)),
        sa.column("shipping_vat_rate", sa.Numeric(5, 2)),
        sa.column("shipping_price_includes_vat", sa.Boolean()), schema="retail",
    )
    items = sa.table(
        "order_items", sa.column("id", sa.Uuid()), sa.column("store_id", sa.Uuid()),
        sa.column("price_includes_vat", sa.Boolean()), schema="retail",
    )
    op.execute(orders.update().where(orders.c.id.in_(order_ids), orders.c.store_id.in_(demo_store)).values(
        shipping_amount=0, shipping_vat_rate=0, shipping_price_includes_vat=False,
    ))
    op.execute(items.update().where(items.c.id.in_(item_ids), items.c.store_id.in_(demo_store)).values(
        price_includes_vat=False,
    ))


def upgrade() -> None:
    op.add_column("order_items", sa.Column("price_includes_vat", sa.Boolean(), nullable=True), schema="retail")
    op.create_unique_constraint("uq_order_items_id_store", "order_items", ["id", "store_id"], schema="retail")
    op.add_column("orders", sa.Column("shipping_amount", sa.Numeric(14, 2), nullable=True), schema="retail")
    op.add_column("orders", sa.Column("shipping_vat_rate", sa.Numeric(5, 2), nullable=True), schema="retail")
    op.add_column("orders", sa.Column("shipping_price_includes_vat", sa.Boolean(), nullable=True), schema="retail")
    op.create_check_constraint(op.f("ck_orders_shipping_amount_nonnegative"), "orders", "shipping_amount >= 0", schema="retail")
    op.create_check_constraint(op.f("ck_orders_shipping_vat_rate_range"), "orders", "shipping_vat_rate >= 0 AND shipping_vat_rate <= 100", schema="retail")
    op.alter_column("orders", "status", existing_type=sa.String(16), type_=sa.String(24), existing_nullable=False, schema="retail")
    op.drop_constraint(op.f("ck_orders_status_allowed"), "orders", type_="check", schema="retail")
    op.create_check_constraint(
        op.f("ck_orders_status_allowed"), "orders",
        "status IN ('completed', 'pending', 'cancelled', 'partially_refunded', 'refunded', 'returned')", schema="retail",
    )
    op.drop_constraint(op.f("ck_expenses_category_allowed"), "expenses", type_="check", schema="retail")
    op.create_check_constraint(
        op.f("ck_expenses_category_allowed"), "expenses",
        "category IN ('advertising', 'employee_costs', 'rent', 'shipping', 'platform_fees', 'software', 'miscellaneous')", schema="retail",
    )
    op.create_table(
        "refunds",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("store_id", sa.Uuid(), nullable=False),
        sa.Column("order_item_id", sa.Uuid(), nullable=False),
        sa.Column("refund_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("amount_includes_vat", sa.Boolean(), nullable=True),
        sa.Column("quantity_returned", sa.Integer(), nullable=False),
        sa.Column("quantity_restocked", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="completed"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("amount >= 0", name=op.f("ck_refunds_amount_nonnegative")),
        sa.CheckConstraint("quantity_returned >= 0", name=op.f("ck_refunds_quantity_returned_nonnegative")),
        sa.CheckConstraint("quantity_restocked >= 0 AND quantity_restocked <= quantity_returned", name=op.f("ck_refunds_quantity_restocked_range")),
        sa.CheckConstraint("status IN ('completed', 'pending', 'cancelled')", name=op.f("ck_refunds_status_allowed")),
        sa.ForeignKeyConstraint(["order_item_id", "store_id"], ["retail.order_items.id", "retail.order_items.store_id"], name="fk_refunds_order_item_store"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refunds")),
        schema="retail",
    )
    op.create_index("ix_refunds_store_date", "refunds", ["store_id", "refund_date"], schema="retail")
    op.create_index("ix_refunds_store_status", "refunds", ["store_id", "status"], schema="retail")
    op.create_index("ix_refunds_order_item_store", "refunds", ["order_item_id", "store_id"], schema="retail")
    _backfill_known_synthetic_rows()


def downgrade() -> None:
    raise RuntimeError(
        "Automatic destructive downgrades are disabled. "
        "Create a reviewed forward recovery migration instead."
    )
