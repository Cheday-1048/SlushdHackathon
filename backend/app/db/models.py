"""ORM storage models; transaction prices and costs are historical snapshots.

Order totals are deliberately derived from their items. The explicit tax-basis
flag applies to both price and discount; NULL means unknown, never tax-exclusive.
discount_amount is the discount for the entire line, not for each unit. Refunds
retain their original item's VAT and cost snapshots through a same-store link.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, ForeignKeyConstraint,
    Index, Integer, Numeric, String, Text, UniqueConstraint, Uuid, and_, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    stores: Mapped[list["Store"]] = relationship(back_populates="organization")


class Store(Base):
    __tablename__ = "stores"
    __table_args__ = (
        CheckConstraint("length(currency) = 3 AND currency = upper(currency)", name="currency_code"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("retail.organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    currency: Mapped[str] = mapped_column(String(3))
    timezone: Mapped[str] = mapped_column(String(64))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    organization: Mapped[Organization] = relationship(back_populates="stores")
    products: Mapped[list["Product"]] = relationship(back_populates="store")
    orders: Mapped[list["Order"]] = relationship(back_populates="store")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="store")
    daily_traffic: Mapped[list["DailyTraffic"]] = relationship(back_populates="store")
    ad_spend: Mapped[list["AdSpend"]] = relationship(back_populates="store")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("store_id", "sku", name="uq_products_store_sku"),
        UniqueConstraint("id", "store_id", name="uq_products_id_store"),
        CheckConstraint("selling_price >= 0", name="selling_price_nonnegative"),
        CheckConstraint("unit_cost >= 0", name="unit_cost_nonnegative"),
        CheckConstraint("vat_rate >= 0 AND vat_rate <= 100", name="vat_rate_range"),
        CheckConstraint("stock_quantity >= 0", name="stock_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    store_id: Mapped[UUID] = mapped_column(ForeignKey("retail.stores.id"))
    sku: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    selling_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    stock_quantity: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    store: Mapped[Store] = relationship(back_populates="products")
    order_items: Mapped[list["OrderItem"]] = relationship(
        back_populates="product",
        primaryjoin=lambda: and_(Product.id == OrderItem.product_id, Product.store_id == OrderItem.store_id),
        foreign_keys=lambda: [OrderItem.product_id],
    )


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("store_id", "order_number", name="uq_orders_store_number"),
        UniqueConstraint("id", "store_id", name="uq_orders_id_store"),
        CheckConstraint(
            "status IN ('completed', 'pending', 'cancelled', 'partially_refunded', 'refunded', 'returned')",
            name="status_allowed",
        ),
        CheckConstraint("shipping_amount >= 0", name="shipping_amount_nonnegative"),
        CheckConstraint("shipping_vat_rate >= 0 AND shipping_vat_rate <= 100", name="shipping_vat_rate_range"),
        Index("ix_orders_store_date", "store_id", "order_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    store_id: Mapped[UUID] = mapped_column(ForeignKey("retail.stores.id"))
    order_number: Mapped[str] = mapped_column(String(64))
    order_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(24))
    shipping_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    shipping_vat_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    shipping_price_includes_vat: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    store: Mapped[Store] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = (
        UniqueConstraint("id", "store_id", name="uq_order_items_id_store"),
        ForeignKeyConstraint(
            ["order_id", "store_id"], ["retail.orders.id", "retail.orders.store_id"],
            name="fk_order_items_order_store",
        ),
        ForeignKeyConstraint(
            ["product_id", "store_id"], ["retail.products.id", "retail.products.store_id"],
            name="fk_order_items_product_store",
        ),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_nonnegative"),
        CheckConstraint("unit_cost_snapshot >= 0", name="unit_cost_nonnegative"),
        CheckConstraint("discount_amount >= 0 AND discount_amount <= quantity * unit_price", name="discount_range"),
        CheckConstraint("vat_rate >= 0 AND vat_rate <= 100", name="vat_rate_range"),
        Index("ix_order_items_order_store", "order_id", "store_id"),
        Index("ix_order_items_product_store", "product_id", "store_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    store_id: Mapped[UUID] = mapped_column(Uuid)
    order_id: Mapped[UUID] = mapped_column(Uuid)
    product_id: Mapped[UUID] = mapped_column(Uuid)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    vat_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    price_includes_vat: Mapped[bool | None] = mapped_column(Boolean)
    unit_cost_snapshot: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    order: Mapped[Order] = relationship(back_populates="items")
    refunds: Mapped[list["Refund"]] = relationship(back_populates="order_item")
    product: Mapped[Product] = relationship(
        back_populates="order_items",
        primaryjoin=lambda: and_(OrderItem.product_id == Product.id, OrderItem.store_id == Product.store_id),
        foreign_keys=lambda: [OrderItem.product_id],
    )


class Refund(Base):
    """A dated merchandise refund and an explicit inventory return disposition.

    Refund money is independent of returned quantities (e.g. a goodwill refund
    need not return inventory). Unknown restocking is retained as NULL, while
    known damaged/non-restocked returns use zero. Historical VAT and cost come
    from the original OrderItem; mutable Product values are never substituted.
    """

    __tablename__ = "refunds"
    __table_args__ = (
        ForeignKeyConstraint(
            ["order_item_id", "store_id"], ["retail.order_items.id", "retail.order_items.store_id"],
            name="fk_refunds_order_item_store",
        ),
        CheckConstraint("amount >= 0", name="amount_nonnegative"),
        CheckConstraint("quantity_returned >= 0", name="quantity_returned_nonnegative"),
        CheckConstraint(
            "quantity_restocked >= 0 AND quantity_restocked <= quantity_returned",
            name="quantity_restocked_range",
        ),
        CheckConstraint("status IN ('completed', 'pending', 'cancelled')", name="status_allowed"),
        Index("ix_refunds_store_date", "store_id", "refund_date"),
        Index("ix_refunds_store_status", "store_id", "status"),
        Index("ix_refunds_order_item_store", "order_item_id", "store_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    store_id: Mapped[UUID] = mapped_column(Uuid)
    order_item_id: Mapped[UUID] = mapped_column(Uuid)
    refund_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    amount_includes_vat: Mapped[bool | None] = mapped_column(Boolean)
    quantity_returned: Mapped[int] = mapped_column(Integer)
    quantity_restocked: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="completed", server_default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    order_item: Mapped[OrderItem] = relationship(back_populates="refunds")


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint(
            "category IN ('advertising', 'employee_costs', 'rent', 'shipping', 'platform_fees', 'software', 'miscellaneous')",
            name="category_allowed",
        ),
        CheckConstraint("amount >= 0", name="amount_nonnegative"),
        Index("ix_expenses_store_date", "store_id", "expense_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    store_id: Mapped[UUID] = mapped_column(ForeignKey("retail.stores.id"))
    category: Mapped[str] = mapped_column(String(32))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    expense_date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    store: Mapped[Store] = relationship(back_populates="expenses")


class DailyTraffic(Base):
    __tablename__ = "daily_traffic"
    __table_args__ = (
        UniqueConstraint("store_id", "date", name="uq_daily_traffic_store_date"),
        CheckConstraint("visitors >= 0", name="visitors_nonnegative"),
        CheckConstraint("sessions >= visitors", name="sessions_at_least_visitors"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    store_id: Mapped[UUID] = mapped_column(ForeignKey("retail.stores.id"))
    date: Mapped[date] = mapped_column(Date)
    visitors: Mapped[int] = mapped_column(Integer)
    sessions: Mapped[int] = mapped_column(Integer)
    store: Mapped[Store] = relationship(back_populates="daily_traffic")


class AdSpend(Base):
    __tablename__ = "ad_spend"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="amount_nonnegative"),
        Index("ix_ad_spend_store_date", "store_id", "spend_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    store_id: Mapped[UUID] = mapped_column(ForeignKey("retail.stores.id"))
    platform: Mapped[str] = mapped_column(String(80))
    campaign_name: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    spend_date: Mapped[date] = mapped_column(Date)
    store: Mapped[Store] = relationship(back_populates="ad_spend")
