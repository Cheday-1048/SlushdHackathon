"""Queries are always scoped to the single explicitly synthetic demo store."""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.demo import DEMO_ORGANIZATION_ID, DEMO_STORE_ID
from app.db.models import AdSpend, DailyTraffic, Expense, Order, OrderItem, Organization, Product, Store


class DemoStoreNotFound(Exception):
    pass


def get_store(session: Session) -> Store:
    store = session.scalar(select(Store).join(Organization).where(
        Store.id == DEMO_STORE_ID,
        Store.organization_id == DEMO_ORGANIZATION_ID,
        Store.is_demo.is_(True),
        Organization.is_demo.is_(True),
    ))
    if store is None:
        raise DemoStoreNotFound("The synthetic demo store has not been seeded. Run the backend seed command.")
    return store


def order_bounds(store: Store, start_date: date, end_date: date) -> tuple[datetime, datetime]:
    zone = ZoneInfo(store.timezone)
    return (
        datetime.combine(start_date, time.min, zone).astimezone(timezone.utc),
        datetime.combine(end_date + timedelta(days=1), time.min, zone).astimezone(timezone.utc),
    )


def list_products(session: Session, limit: int = 50, offset: int = 0) -> tuple[list[Product], int]:
    store = get_store(session)
    filters = Product.store_id == store.id
    items = list(session.scalars(select(Product).where(filters).order_by(Product.sku).limit(limit).offset(offset)))
    return items, session.scalar(select(func.count()).select_from(Product).where(filters)) or 0


def list_orders(session: Session, start_date: date, end_date: date, limit: int = 50, offset: int = 0) -> list[Order]:
    store = get_store(session)
    start, end = order_bounds(store, start_date, end_date)
    return list(session.scalars(select(Order).where(Order.store_id == store.id, Order.order_date >= start,
        Order.order_date < end).order_by(Order.order_date, Order.id).limit(limit).offset(offset)))


def list_expenses(session: Session, start_date: date, end_date: date, limit: int = 50, offset: int = 0) -> tuple[list[Expense], int]:
    store = get_store(session)
    filters = (Expense.store_id == store.id, Expense.expense_date >= start_date, Expense.expense_date <= end_date)
    items = list(session.scalars(select(Expense).where(*filters).order_by(Expense.expense_date, Expense.id).limit(limit).offset(offset)))
    return items, session.scalar(select(func.count()).select_from(Expense).where(*filters)) or 0


def list_daily_traffic(session: Session, start_date: date, end_date: date) -> list[DailyTraffic]:
    store = get_store(session)
    return list(session.scalars(select(DailyTraffic).where(DailyTraffic.store_id == store.id,
        DailyTraffic.date >= start_date, DailyTraffic.date <= end_date).order_by(DailyTraffic.date)))


def list_ad_spend(session: Session, start_date: date, end_date: date) -> list[AdSpend]:
    store = get_store(session)
    return list(session.scalars(select(AdSpend).where(AdSpend.store_id == store.id,
        AdSpend.spend_date >= start_date, AdSpend.spend_date <= end_date).order_by(AdSpend.spend_date, AdSpend.id)))


def dashboard_totals(session: Session, store: Store, start_date: date, end_date: date) -> dict:
    start, end = order_bounds(store, start_date, end_date)
    order_filters = (Order.store_id == store.id, Order.status == "completed", Order.order_date >= start, Order.order_date < end)
    revenue = session.scalar(select(func.sum(OrderItem.quantity * OrderItem.unit_price - OrderItem.discount_amount))
        .join(Order, Order.id == OrderItem.order_id).where(*order_filters)) or Decimal("0.00")
    orders = session.scalar(select(func.count()).select_from(Order).where(*order_filters)) or 0
    visitors = session.scalar(select(func.sum(DailyTraffic.visitors)).where(DailyTraffic.store_id == store.id,
        DailyTraffic.date >= start_date, DailyTraffic.date <= end_date)) or 0
    operating = session.scalar(select(func.sum(Expense.amount)).where(Expense.store_id == store.id,
        Expense.category != "advertising", Expense.expense_date >= start_date, Expense.expense_date <= end_date)) or Decimal("0.00")
    advertising = session.scalar(select(func.sum(AdSpend.amount)).where(AdSpend.store_id == store.id,
        AdSpend.spend_date >= start_date, AdSpend.spend_date <= end_date)) or Decimal("0.00")
    return {"revenue": revenue, "total_orders": orders, "total_visitors": visitors,
            "operating_expenses": operating, "advertising_expenditure": advertising}
