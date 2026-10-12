"""Read historical inputs for the authorized demo store; no profit arithmetic.

A report loads a bounded number of queries regardless of its day/product count.
The returned records can feed the same pure engine for the whole period and its
individual day/product views without querying the database again.
"""

from dataclasses import dataclass
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AdSpend, DailyTraffic, Expense, Order, OrderItem, Refund, Store
from app.db.session import DatabaseError
from app.repositories.retail import order_bounds
from app.services.finance import ExpenseEntry, FinancialInput, RefundLine, SaleLine, ShippingCharge
from app.services.finance.calculations import validate_refund_history

RECOGNIZED_STATUSES = ("completed", "partially_refunded", "refunded", "returned")
RETURN_STATUSES = ("partially_refunded", "refunded", "returned")
HISTORY_WARNING = "Historical VAT basis is incomplete; cumulative refund cash limits could not be fully verified."

RefundRecord = tuple[Refund, OrderItem, datetime]


def sale_snapshot(item: OrderItem) -> SaleLine:
    return SaleLine(quantity=item.quantity, unit_price=item.unit_price,
        discount_amount=item.discount_amount, vat_rate=item.vat_rate,
        unit_cost_snapshot=item.unit_cost_snapshot, price_includes_vat=item.price_includes_vat)


def refund_snapshot(refund: Refund, item: OrderItem) -> RefundLine:
    return RefundLine(amount=refund.amount, amount_includes_vat=refund.amount_includes_vat,
        vat_rate=item.vat_rate, unit_cost_snapshot=item.unit_cost_snapshot,
        quantity_returned=refund.quantity_returned, quantity_restocked=refund.quantity_restocked)


@dataclass(frozen=True)
class FinancialRecords:
    orders: list[Order]
    items: list[OrderItem]
    refunds: list[RefundRecord]
    expenses: list[Expense]
    ads: list[AdSpend]
    traffic: list[DailyTraffic]
    missing_refund_orders: list[Order]
    missing_refund_items: list[OrderItem]
    unverified_refund_items: frozenset[UUID]

    def inputs(self, period_days: int) -> FinancialInput:
        """Build value objects only; all monetary arithmetic stays in the engine."""
        item_order_ids = {item.order_id for item in self.items}
        return FinancialInput(
            sales=[sale_snapshot(item) for item in self.items],
            refunds=[refund_snapshot(refund, item) for refund, item, _ in self.refunds],
            shipping=[ShippingCharge(amount=order.shipping_amount, vat_rate=order.shipping_vat_rate,
                price_includes_vat=order.shipping_price_includes_vat) for order in self.orders],
            expenses=[ExpenseEntry(category=entry.category, amount=entry.amount) for entry in self.expenses],
            ad_spend=[entry.amount for entry in self.ads], order_count=len(self.orders),
            visitors=sum(entry.visitors for entry in self.traffic), traffic_days=len(self.traffic),
            period_days=period_days, missing_refund_orders=len(self.missing_refund_orders),
            missing_order_items=sum(order.id not in item_order_ids for order in self.orders),
            extra_warnings=[HISTORY_WARNING] if any(
                item.id in self.unverified_refund_items for _, item, _ in self.refunds
            ) else [],
        )


def load_financial_records(session: Session, store: Store, start_date: date, end_date: date) -> FinancialRecords:
    start, end = order_bounds(store, start_date, end_date)
    order_filters = (Order.store_id == store.id, Order.status.in_(RECOGNIZED_STATUSES),
        Order.order_date >= start, Order.order_date < end)
    orders = list(session.scalars(select(Order).where(*order_filters).order_by(Order.order_date, Order.id)))
    items = list(session.scalars(select(OrderItem).join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.store_id == store.id, *order_filters).order_by(OrderItem.id)))

    # Refunds are recognized on the event date, including sales in older periods.
    refund_rows = [tuple(row) for row in session.execute(
        select(Refund, OrderItem, Order.order_date).select_from(Refund).join(OrderItem,
            (Refund.order_item_id == OrderItem.id) & (Refund.store_id == OrderItem.store_id))
        .join(Order, Order.id == OrderItem.order_id).where(
            Refund.store_id == store.id, Order.store_id == store.id,
            Order.status.in_(RECOGNIZED_STATUSES), Refund.status == "completed",
            Refund.refund_date >= start, Refund.refund_date < end).order_by(Refund.refund_date, Refund.id))]

    # Check each affected item's full posted ledger, not only this interval.
    # This also prevents excess restocking from manufacturing historical profit.
    affected_items = {item.id: item for _, item, _ in refund_rows}
    sale_dates = {item.id: order_date for _, item, order_date in refund_rows}
    unverified_items = set()
    if affected_items:
        history: dict = {item_id: [] for item_id in affected_items}
        for refund in session.scalars(select(Refund).where(Refund.store_id == store.id,
                Refund.order_item_id.in_(affected_items), Refund.status == "completed")):
            if refund.refund_date < sale_dates[refund.order_item_id]:
                raise DatabaseError("invalid_financial_history",
                    "A completed refund is dated before its original sale. Correct the refund ledger before reporting.")
            history[refund.order_item_id].append(refund_snapshot(refund, affected_items[refund.order_item_id]))
        try:
            for item_id, lines in history.items():
                validate_refund_history(sale_snapshot(affected_items[item_id]), lines)
                if affected_items[item_id].price_includes_vat is None or any(
                        line.amount_includes_vat is None for line in lines):
                    unverified_items.add(item_id)
        except ValueError as exc:
            raise DatabaseError("invalid_financial_history",
                "Stored refund totals exceed their original transaction. Correct the refund ledger before reporting.") from exc

    posted_refund = select(Refund.id).join(OrderItem,
        (Refund.order_item_id == OrderItem.id) & (Refund.store_id == OrderItem.store_id)).where(
            OrderItem.order_id == Order.id, Refund.store_id == store.id,
            Refund.status == "completed").correlate(Order).exists()
    # No event timestamp means the refund cannot be allocated to a date. Flag
    # all subsequent reports conservatively until the missing ledger is supplied.
    # An outer join retains orders without item snapshots; product attribution
    # can use the known items without inventing a product for missing snapshots.
    missing_rows = session.execute(select(Order, OrderItem).outerjoin(OrderItem,
        (OrderItem.order_id == Order.id) & (OrderItem.store_id == Order.store_id)).where(
            Order.store_id == store.id, Order.status.in_(RETURN_STATUSES),
            Order.order_date < end, ~posted_refund).order_by(Order.order_date, Order.id, OrderItem.id))
    missing_orders = {}
    missing_items = []
    for order, item in missing_rows:
        missing_orders[order.id] = order
        if item is not None:
            missing_items.append(item)

    expenses = list(session.scalars(select(Expense).where(Expense.store_id == store.id,
        Expense.expense_date >= start_date, Expense.expense_date <= end_date)))
    ads = list(session.scalars(select(AdSpend).where(AdSpend.store_id == store.id,
        AdSpend.spend_date >= start_date, AdSpend.spend_date <= end_date)))
    traffic = list(session.scalars(select(DailyTraffic).where(DailyTraffic.store_id == store.id,
        DailyTraffic.date >= start_date, DailyTraffic.date <= end_date).order_by(DailyTraffic.date)))
    return FinancialRecords(orders, items, refund_rows, expenses, ads, traffic,
        list(missing_orders.values()), missing_items, frozenset(unverified_items))


def financial_inputs(session: Session, store: Store, start_date: date, end_date: date) -> FinancialInput:
    """Compatibility entry point used by the existing Phase 03 finance service."""
    return load_financial_records(session, store, start_date, end_date).inputs((end_date - start_date).days + 1)
