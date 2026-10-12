"""Create retail schema and the Phase 02 persistent store models.

Revision ID: 0001_retail_schema
Revises: none

Prices and costs are tax-exclusive NUMERIC snapshots. The retail namespace is
not one of Supabase's default exposed API schemas. No production data is reset.
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_retail_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS retail")
    op.create_table('organizations',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('is_demo', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_organizations')),
    schema='retail'
    )
    op.create_table('stores',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('currency', sa.String(length=3), nullable=False),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('is_demo', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('length(currency) = 3 AND currency = upper(currency)', name=op.f('ck_stores_currency_code')),
    sa.ForeignKeyConstraint(['organization_id'], ['retail.organizations.id'], name=op.f('fk_stores_organization_id_organizations')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_stores')),
    schema='retail'
    )
    op.create_index(op.f('ix_stores_organization_id'), 'stores', ['organization_id'], unique=False, schema='retail')
    op.create_table('ad_spend',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('store_id', sa.Uuid(), nullable=False),
    sa.Column('platform', sa.String(length=80), nullable=False),
    sa.Column('campaign_name', sa.String(length=200), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('spend_date', sa.Date(), nullable=False),
    sa.CheckConstraint('amount >= 0', name=op.f('ck_ad_spend_amount_nonnegative')),
    sa.ForeignKeyConstraint(['store_id'], ['retail.stores.id'], name=op.f('fk_ad_spend_store_id_stores')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ad_spend')),
    schema='retail'
    )
    op.create_index('ix_ad_spend_store_date', 'ad_spend', ['store_id', 'spend_date'], unique=False, schema='retail')
    op.create_table('daily_traffic',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('store_id', sa.Uuid(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('visitors', sa.Integer(), nullable=False),
    sa.Column('sessions', sa.Integer(), nullable=False),
    sa.CheckConstraint('sessions >= visitors', name=op.f('ck_daily_traffic_sessions_at_least_visitors')),
    sa.CheckConstraint('visitors >= 0', name=op.f('ck_daily_traffic_visitors_nonnegative')),
    sa.ForeignKeyConstraint(['store_id'], ['retail.stores.id'], name=op.f('fk_daily_traffic_store_id_stores')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_daily_traffic')),
    sa.UniqueConstraint('store_id', 'date', name='uq_daily_traffic_store_date'),
    schema='retail'
    )
    op.create_table('expenses',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('store_id', sa.Uuid(), nullable=False),
    sa.Column('category', sa.String(length=32), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('expense_date', sa.Date(), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("category IN ('advertising', 'employee_costs', 'rent', 'shipping', 'software', 'miscellaneous')", name=op.f('ck_expenses_category_allowed')),
    sa.CheckConstraint('amount >= 0', name=op.f('ck_expenses_amount_nonnegative')),
    sa.ForeignKeyConstraint(['store_id'], ['retail.stores.id'], name=op.f('fk_expenses_store_id_stores')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_expenses')),
    schema='retail'
    )
    op.create_index('ix_expenses_store_date', 'expenses', ['store_id', 'expense_date'], unique=False, schema='retail')
    op.create_table('orders',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('store_id', sa.Uuid(), nullable=False),
    sa.Column('order_number', sa.String(length=64), nullable=False),
    sa.Column('order_date', sa.DateTime(timezone=True), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('completed', 'pending', 'cancelled')", name=op.f('ck_orders_status_allowed')),
    sa.ForeignKeyConstraint(['store_id'], ['retail.stores.id'], name=op.f('fk_orders_store_id_stores')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_orders')),
    sa.UniqueConstraint('id', 'store_id', name='uq_orders_id_store'),
    sa.UniqueConstraint('store_id', 'order_number', name='uq_orders_store_number'),
    schema='retail'
    )
    op.create_index('ix_orders_store_date', 'orders', ['store_id', 'order_date'], unique=False, schema='retail')
    op.create_table('products',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('store_id', sa.Uuid(), nullable=False),
    sa.Column('sku', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('selling_price', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('unit_cost', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('vat_rate', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('stock_quantity', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('selling_price >= 0', name=op.f('ck_products_selling_price_nonnegative')),
    sa.CheckConstraint('stock_quantity >= 0', name=op.f('ck_products_stock_nonnegative')),
    sa.CheckConstraint('unit_cost >= 0', name=op.f('ck_products_unit_cost_nonnegative')),
    sa.CheckConstraint('vat_rate >= 0 AND vat_rate <= 100', name=op.f('ck_products_vat_rate_range')),
    sa.ForeignKeyConstraint(['store_id'], ['retail.stores.id'], name=op.f('fk_products_store_id_stores')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_products')),
    sa.UniqueConstraint('id', 'store_id', name='uq_products_id_store'),
    sa.UniqueConstraint('store_id', 'sku', name='uq_products_store_sku'),
    schema='retail'
    )
    op.create_table('order_items',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('store_id', sa.Uuid(), nullable=False),
    sa.Column('order_id', sa.Uuid(), nullable=False),
    sa.Column('product_id', sa.Uuid(), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('unit_price', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('discount_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('vat_rate', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('unit_cost_snapshot', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.CheckConstraint('discount_amount >= 0 AND discount_amount <= quantity * unit_price', name=op.f('ck_order_items_discount_range')),
    sa.CheckConstraint('quantity > 0', name=op.f('ck_order_items_quantity_positive')),
    sa.CheckConstraint('unit_cost_snapshot >= 0', name=op.f('ck_order_items_unit_cost_nonnegative')),
    sa.CheckConstraint('unit_price >= 0', name=op.f('ck_order_items_unit_price_nonnegative')),
    sa.CheckConstraint('vat_rate >= 0 AND vat_rate <= 100', name=op.f('ck_order_items_vat_rate_range')),
    sa.ForeignKeyConstraint(['order_id', 'store_id'], ['retail.orders.id', 'retail.orders.store_id'], name='fk_order_items_order_store'),
    sa.ForeignKeyConstraint(['product_id', 'store_id'], ['retail.products.id', 'retail.products.store_id'], name='fk_order_items_product_store'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_order_items')),
    schema='retail'
    )
    op.create_index('ix_order_items_order_store', 'order_items', ['order_id', 'store_id'], unique=False, schema='retail')
    op.create_index('ix_order_items_product_store', 'order_items', ['product_id', 'store_id'], unique=False, schema='retail')


def downgrade() -> None:
    raise RuntimeError(
        "Automatic destructive downgrades are disabled. "
        "Create a reviewed forward recovery migration instead."
    )
