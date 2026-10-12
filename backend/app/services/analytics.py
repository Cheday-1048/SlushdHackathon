"""Consistent daily, product, and expense views of the existing finance engine.

SQL retrieves each source once inside the request's read-only repeatable-read
transaction. Bucketing only selects historical inputs; every monetary amount,
margin, and conversion rate comes from calculate_financials.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Product
from app.db.session import get_db_session
from app.repositories.finance import FinancialRecords, load_financial_records
from app.repositories.retail import get_store
from app.schemas.analytics import (
    AnalyticsDashboard, AnalyticsQuery, DailyAnalytics, ExpenseAnalytics, ProductAnalytics,
)
from app.schemas.finance import FinanceSummary
from app.services.dashboard import demo_source
from app.services.finance import calculate_financials


def utc_now() -> datetime:
    """A single injectable clock reading determines store-local rolling periods."""
    return datetime.now(timezone.utc)


def _daily_views(records: FinancialRecords, start: date, end: date, zone: ZoneInfo) -> list[DailyAnalytics]:
    orders = defaultdict(list)
    items = defaultdict(list)
    refunds = defaultdict(list)
    expenses = defaultdict(list)
    ads = defaultdict(list)
    traffic = defaultdict(list)
    order_dates = {}
    for order in records.orders:
        day = order.order_date.astimezone(zone).date()
        orders[day].append(order)
        order_dates[order.id] = day
    for item in records.items:
        items[order_dates[item.order_id]].append(item)
    for row in records.refunds:
        refunds[row[0].refund_date.astimezone(zone).date()].append(row)
    for entry in records.expenses:
        expenses[entry.expense_date].append(entry)
    for entry in records.ads:
        ads[entry.spend_date].append(entry)
    for entry in records.traffic:
        traffic[entry.date].append(entry)
    missing_orders = [(order, order.order_date.astimezone(zone).date()) for order in records.missing_refund_orders]
    result = []
    day = start
    while day <= end:
        day_records = FinancialRecords(orders[day], items[day], refunds[day], expenses[day], ads[day], traffic[day],
            [order for order, sale_day in missing_orders if sale_day <= day], [], records.unverified_refund_items)
        calculated = calculate_financials(day_records.inputs(period_days=1))
        result.append(DailyAnalytics(date=day, revenue=calculated.revenue, order_count=calculated.order_count,
            visitors=calculated.visitors if traffic[day] else None, conversion_rate=calculated.conversion_rate,
            operating_expenses=calculated.operating_expenses, advertising_expenditure=calculated.advertising_expenditure,
            total_expenses=calculated.total_expenses, gross_profit=calculated.gross_profit,
            operating_profit=calculated.operating_profit, data_completeness=calculated.data_completeness))
        day += timedelta(days=1)
    return result


def _product_views(session: Session, store_id, records: FinancialRecords) -> list[ProductAnalytics]:
    sales = defaultdict(list)
    refunds = defaultdict(list)
    missing_orders = defaultdict(set)
    for item in records.items:
        sales[item.product_id].append(item)
    for row in records.refunds:
        refunds[row[1].product_id].append(row)
    for item in records.missing_refund_items:
        missing_orders[item.product_id].add(item.order_id)
    product_ids = sales.keys() | refunds.keys() | missing_orders.keys()
    if not product_ids:
        return []
    # Product supplies current display labels only. Its mutable price, VAT and
    # cost never enter an input to the finance engine.
    labels = session.execute(select(Product.id, Product.name, Product.sku).where(
        Product.store_id == store_id, Product.id.in_(product_ids)).order_by(Product.sku, Product.id))
    unresolved_orders = {order.id: order for order in records.missing_refund_orders}
    result = []
    for product_id, name, sku in labels:
        product_records = FinancialRecords([], sales[product_id], refunds[product_id], [], [], [],
            [unresolved_orders[order_id] for order_id in missing_orders[product_id]], [], records.unverified_refund_items)
        # Order-wide shipping, traffic, and operating costs have no product
        # allocation. Their inputs are absent, with zero applicable traffic days.
        calculated = calculate_financials(product_records.inputs(period_days=0))
        result.append(ProductAnalytics(product_id=product_id, name=name, sku=sku,
            units_sold=sum(item.quantity for item in sales[product_id]),
            units_returned=sum(refund.quantity_returned for refund, _, _ in refunds[product_id]),
            revenue=calculated.revenue, cogs=calculated.cogs, gross_profit=calculated.gross_profit,
            gross_profit_margin=calculated.gross_profit_margin, data_completeness=calculated.data_completeness))
    return result


class AnalyticsService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_dashboard(self, query: AnalyticsQuery | None = None) -> AnalyticsDashboard:
        query = query or AnalyticsQuery()
        store = get_store(self.session)
        zone = ZoneInfo(store.timezone)
        as_of_date = utc_now().astimezone(zone).date()
        period = query.period(as_of_date)
        records = load_financial_records(self.session, store, period.start, period.end)
        calculated = calculate_financials(records.inputs((period.end - period.start).days + 1))
        summary = FinanceSummary(**calculated.model_dump(), store_id=store.id, currency=store.currency,
            reporting_period=period, data_source=demo_source())
        expense_fields = (
            ("employee_costs", "Employee costs", "employee_expenses"),
            ("rent", "Rent", "rent_expenses"),
            ("shipping", "Shipping", "shipping_expenses"),
            ("platform_fees", "Platform fees", "platform_fees"),
            ("other_operating", "Other operating expenses", "other_operating_expenses"),
            ("advertising", "Advertising", "advertising_expenditure"),
        )
        product_warnings = []
        if calculated.data_completeness.missing_order_items:
            product_warnings.append("Some orders have no historical item snapshots; their sales cannot be attributed to products.")
        missing_item_orders = {item.order_id for item in records.missing_refund_items}
        if any(order.id not in missing_item_orders for order in records.missing_refund_orders):
            product_warnings.append("Some returned orders have neither refund records nor item snapshots; their adjustments cannot be attributed to products.")
        if records.missing_refund_orders:
            product_warnings.append("Undated missing refunds make affected product revenue and cost adjustments unavailable; returned-unit counts include posted events only.")
        return AnalyticsDashboard(summary=summary, store_timezone=store.timezone, as_of_date=as_of_date,
            selected_preset=query.selected_preset,
            daily=_daily_views(records, period.start, period.end, zone),
            products=_product_views(self.session, store.id, records),
            expenses=[ExpenseAnalytics(category=category, label=label, amount=getattr(calculated, field))
                for category, label, field in expense_fields],
            unallocated_customer_shipping_revenue=calculated.customer_shipping_revenue,
            product_warnings=product_warnings)


def get_analytics_service(session: Annotated[Session, Depends(get_db_session)]) -> AnalyticsService:
    return AnalyticsService(session)
