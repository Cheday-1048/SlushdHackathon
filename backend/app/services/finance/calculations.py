"""Pure financial arithmetic, with no database or HTTP dependencies.

Amounts are rounded to currency cents with ROUND_HALF_UP at each transaction
line, then summed. VAT-inclusive lines preserve gross = exclusive + VAT, and
discounts preserve gross sales - discounts = discounted merchandise revenue.
Costs use booked amounts: no input-VAT or income-tax calculation is attempted.
"""

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP, localcontext

from .profit import money, profit_totals
from .types import DataCompleteness, FinancialInput, FinancialResult, RefundLine, SaleLine

ZERO = Decimal("0.00")
HUNDRED = Decimal("100")


def split_vat(amount: Decimal, vat_rate: Decimal, includes_vat: bool) -> tuple[Decimal, Decimal]:
    """Return (exclusive amount, VAT) for one known-basis transaction line.

    ``vat_rate`` is a percentage. Callers must use validated Decimal inputs.
    """
    if includes_vat:
        exclusive = money(amount / (Decimal(1) + vat_rate / HUNDRED))
        return exclusive, money(amount) - exclusive
    exclusive = money(amount)
    return exclusive, money(amount * vat_rate / HUNDRED)


def validate_refund_history(sale: SaleLine, refunds: list[RefundLine]) -> None:
    """Reject overreturns/overrefunds across a sale line's complete refund ledger.

    The repository supplies all completed refund events, across all periods.
    Quantities are always checked. When every tax basis is known, compare
    settlement cash: rounded inclusive amounts, or rounded exclusive amounts
    plus their rounded VAT. Comparing exclusive amounts alone would reject a
    valid split refund when independent credit-note rounding differs by a cent
    from the original invoice. Reports retain those explicit revenue/VAT
    residuals; this validation never reallocates tax or changes snapshots.
    """
    if sum(line.quantity_returned for line in refunds) > sale.quantity:
        raise ValueError("Cumulative returned quantity exceeds the original sold quantity")
    if sale.price_includes_vat is None or any(line.amount_includes_vat is None for line in refunds):
        return
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_UP
        sale_exclusive, sale_vat = split_vat(
            sale.quantity * sale.unit_price - sale.discount_amount, sale.vat_rate, sale.price_includes_vat
        )
        refunded_cash = sum((
            sum(split_vat(line.amount, line.vat_rate, line.amount_includes_vat), ZERO)
            for line in refunds
        ), ZERO)
        if refunded_cash > sale_exclusive + sale_vat:
            raise ValueError("Cumulative refunds exceed the original discounted settlement amount")


def calculate_financials(data: FinancialInput) -> FinancialResult:
    """Calculate reporting metrics from historical, preselected transactions.

    Repository code is responsible for authorized store/date/status selection.
    A missing financial basis produces null dependent metrics, never invented
    revenue/refunds. AdSpend is authoritative; advertising Expense rows are
    intentionally excluded, including when AdSpend has no records.
    """
    # Isolate precision and rounding from ambient application Decimal settings.
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_UP
        return _calculate(data)


def _calculate(data: FinancialInput) -> FinancialResult:
    warnings = list(data.extra_warnings)
    missing_sales_vat = sum(line.price_includes_vat is None for line in data.sales)
    missing_refund_vat = sum(line.amount_includes_vat is None for line in data.refunds)
    missing_restock = sum(
        line.quantity_returned > 0 and line.quantity_restocked is None for line in data.refunds
    )
    missing_shipping = sum(
        line.amount is None or (
            line.amount != 0 and (line.vat_rate is None or line.price_includes_vat is None)
        )
        for line in data.shipping
    )

    gross_sales = discounted_sales = sales_vat = ZERO
    for line in data.sales:
        if line.price_includes_vat is None:
            continue
        gross, _ = split_vat(line.quantity * line.unit_price, line.vat_rate, line.price_includes_vat)
        discounted, vat = split_vat(
            line.quantity * line.unit_price - line.discount_amount, line.vat_rate, line.price_includes_vat
        )
        gross_sales += gross
        discounted_sales += discounted
        sales_vat += vat
    discounts: Decimal | None = gross_sales - discounted_sales
    if missing_sales_vat or data.missing_order_items:
        gross_sales = discounted_sales = sales_vat = discounts = None
    if missing_sales_vat:
        warnings.append(f"VAT-inclusive status is unknown for {missing_sales_vat} sales line(s).")
    if data.missing_order_items:
        warnings.append(f"Historical item snapshots are missing for {data.missing_order_items} recognized order(s).")

    shipping_revenue = shipping_vat = ZERO
    for line in data.shipping:
        if line.amount is None or line.amount == 0:
            continue
        if line.vat_rate is None or line.price_includes_vat is None:
            continue
        exclusive, vat = split_vat(line.amount, line.vat_rate, line.price_includes_vat)
        shipping_revenue += exclusive
        shipping_vat += vat
    if missing_shipping:
        shipping_revenue = shipping_vat = None
        warnings.append(f"Customer shipping amount or VAT basis is unknown for {missing_shipping} order(s).")

    refunds = vat_refunded = ZERO
    for line in data.refunds:
        if line.amount_includes_vat is None:
            continue
        exclusive, vat = split_vat(line.amount, line.vat_rate, line.amount_includes_vat)
        refunds += exclusive
        vat_refunded += vat
    if missing_refund_vat or data.missing_refund_orders:
        refunds = vat_refunded = None
    if missing_refund_vat:
        warnings.append(f"VAT-inclusive status is unknown for {missing_refund_vat} refund line(s).")
    if data.missing_refund_orders:
        warnings.append(f"Refund records are missing for {data.missing_refund_orders} returned order(s).")

    cogs_before_returns = (
        None if data.missing_order_items else
        sum((money(line.quantity * line.unit_cost_snapshot) for line in data.sales), ZERO)
    )
    cogs_reversed = (
        None if missing_restock or data.missing_refund_orders else
        sum((money((line.quantity_restocked or 0) * line.unit_cost_snapshot) for line in data.refunds), ZERO)
    )
    if missing_restock:
        warnings.append(f"Restocked quantity is unknown for {missing_restock} refund line(s).")
    cogs = None if cogs_before_returns is None or cogs_reversed is None else cogs_before_returns - cogs_reversed

    vat_collected = None if sales_vat is None or shipping_vat is None else sales_vat + shipping_vat
    net_vat = None if vat_collected is None or vat_refunded is None else vat_collected - vat_refunded
    revenue = (
        None if discounted_sales is None or shipping_revenue is None or refunds is None else
        discounted_sales + shipping_revenue - refunds
    )
    expense_buckets = {
        "employee_costs": ZERO, "rent": ZERO, "shipping": ZERO,
        "platform_fees": ZERO, "software": ZERO, "miscellaneous": ZERO,
    }
    for entry in data.expenses:
        if entry.category != "advertising":
            expense_buckets[entry.category] += money(entry.amount)
    ads = sum((money(amount) for amount in data.ad_spend), ZERO)
    other_expenses = expense_buckets["software"] + expense_buckets["miscellaneous"]
    profits = profit_totals(
        revenue=revenue, cogs=cogs, advertising=ads,
        employee=expense_buckets["employee_costs"], rent=expense_buckets["rent"],
        shipping=expense_buckets["shipping"], platform_fees=expense_buckets["platform_fees"],
        other=other_expenses,
    )
    average_order_value = None if revenue is None or data.order_count == 0 else money(revenue / data.order_count)
    conversion_rate = (
        money(Decimal(data.order_count) / Decimal(data.visitors) * HUNDRED) if data.visitors else
        (None if data.order_count else ZERO)
    )
    if data.traffic_days < data.period_days:
        conversion_rate = None
        warnings.append(f"Visitor data covers {data.traffic_days} of {data.period_days} reporting days.")
    if data.order_count and not data.visitors:
        warnings.append("Orders exist but recorded visitors are zero; conversion rate is unavailable.")

    fixed_costs = expense_buckets["employee_costs"] + expense_buckets["rent"] + other_expenses
    break_even = None
    if data.order_count > 0 and profits.contribution_profit is not None and profits.contribution_profit > 0:
        # Multiplying before division avoids prematurely rounding per-order
        # contribution. This is a period-mix estimate, not a sales forecast.
        break_even = int((fixed_costs * data.order_count / profits.contribution_profit).to_integral_value(rounding=ROUND_CEILING))

    return FinancialResult(
        gross_sales=gross_sales,
        discounts=discounts,
        vat_exclusive_sales_revenue=discounted_sales,
        customer_shipping_revenue=shipping_revenue,
        vat_collected_sales=vat_collected,
        refunds=refunds,
        vat_refunded=vat_refunded,
        net_vat_collected=net_vat,
        net_sales_revenue=revenue,
        revenue=revenue,
        cogs_before_returns=cogs_before_returns,
        cogs_reversed=cogs_reversed,
        cogs=cogs,
        gross_profit=profits.gross_profit,
        gross_profit_margin=profits.gross_profit_margin,
        contribution_profit=profits.contribution_profit,
        contribution_margin=profits.contribution_margin,
        advertising_expenditure=ads,
        employee_expenses=expense_buckets["employee_costs"],
        rent_expenses=expense_buckets["rent"],
        shipping_expenses=expense_buckets["shipping"],
        platform_fees=expense_buckets["platform_fees"],
        other_operating_expenses=other_expenses,
        operating_expenses=profits.operating_expenses,
        total_expenses=profits.total_expenses,
        operating_profit=profits.operating_profit,
        operating_profit_margin=profits.operating_profit_margin,
        average_order_value=average_order_value,
        conversion_rate=conversion_rate,
        break_even_order_quantity=break_even,
        order_count=data.order_count,
        visitors=data.visitors,
        data_completeness=DataCompleteness(
            is_complete=not warnings,
            warnings=list(dict.fromkeys(warnings)),
            missing_vat_lines=missing_sales_vat + missing_refund_vat,
            missing_refund_orders=data.missing_refund_orders,
            missing_shipping_orders=missing_shipping,
            missing_restock_refunds=missing_restock,
            missing_order_items=data.missing_order_items,
            traffic_days=data.traffic_days,
            expected_traffic_days=data.period_days,
        ),
    )
