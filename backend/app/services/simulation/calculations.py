"""Deterministic aggregate scenarios built on historical financial results.

This model holds the period's net basket, product mix and refund/restock pattern
constant. It estimates the effect of user assumptions; it does not predict the
effect of price or advertising on customer behaviour.
"""

from dataclasses import asdict
from decimal import Decimal, ROUND_HALF_UP, localcontext

from app.services.finance import FinancialResult
from app.services.finance.profit import money, profit_totals

from .types import ScenarioParameters, SimulatedMetrics, SimulationCalculation, SimulationDifferences

ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")
VOLUME_PRECISION = Decimal("0.000001")

ASSUMPTIONS = (
    "Hypothetical aggregate scenario, not a prediction or guaranteed business outcome.",
    "The selected historical period's product mix, net merchandise basket, and refund/restock pattern remain constant per expected order.",
    "Revenue is VAT-exclusive and already reflects historical discounts and dated refunds; VAT is not removed again.",
    "Selling-price change applies first, then the additional scenario discount; historical discounts are not applied twice. Customer shipping charges do not receive these price changes.",
    "Expected order volume and visitors are fractional expectations rounded to six decimal places; the same published order volume scales revenue and variable costs. Money rounds HALF_UP to currency cents per component.",
    "Net historical COGS scales with expected order volume and unit-cost change. Carrier shipping, platform fees and customer shipping revenue scale with order volume at the observed per-order mix.",
    "Employee, rent and other operating expenses remain fixed for the selected period; additional operating expense is added to other expenses.",
    "Advertising uses historical AdSpend plus the explicit currency change and does not scale with orders; mirrored advertising expenses are excluded by the finance engine.",
    "Conversion is a separate user assumption, or the exact historical orders-to-visitors ratio when left unchanged; price, discount and advertising changes do not automatically change it.",
    "Operating profit follows the financial report definition and is not accounting net profit. Unrecorded costs and existing accounting limitations remain outside the model.",
)


class SimulationParameterError(ValueError):
    """A validated parameter cannot be applied to the selected baseline."""


def _volume(value: Decimal) -> Decimal:
    return value.quantize(VOLUME_PRECISION, rounding=ROUND_HALF_UP)


def simulate(baseline: FinancialResult, params: ScenarioParameters) -> SimulationCalculation:
    """Return a read-only scenario, or explicit unavailable outputs for gaps.

    ``SimulationParameterError`` means an otherwise valid parameter cannot be applied to this
    baseline (currently a resulting negative advertising budget).
    """
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_UP
        return _simulate(baseline, params)


def _simulate(baseline: FinancialResult, params: ScenarioParameters) -> SimulationCalculation:
    assumptions = list(ASSUMPTIONS)
    warnings = list(baseline.data_completeness.warnings)
    advertising = money(baseline.advertising_expenditure + params.advertising_budget_change_amount)
    if advertising < 0:
        raise SimulationParameterError("Advertising budget change cannot make the scenario advertising budget negative")

    required = [
        baseline.revenue, baseline.cogs, baseline.customer_shipping_revenue,
        baseline.gross_profit, baseline.operating_profit,
    ]
    blocked = False
    if not baseline.data_completeness.is_complete or any(value is None for value in required):
        warnings.append("Simulation is unavailable because the historical baseline has missing or unknown financial/traffic data.")
        blocked = True
    if baseline.order_count <= 0 or baseline.visitors <= 0:
        warnings.append("Simulation requires positive recorded orders and visitors to establish an observed basket and conversion baseline.")
        blocked = True
    if baseline.order_count > baseline.visitors and params.expected_conversion_rate is None:
        warnings.append("The historical orders-to-visitors ratio exceeds 100%; supply an explicit conversion assumption between 0% and 100%.")
        blocked = True
    if baseline.revenue is not None and baseline.customer_shipping_revenue is not None:
        if baseline.revenue - baseline.customer_shipping_revenue < 0:
            warnings.append("The period has negative net merchandise revenue; a refund-dominated basket is unsupported by this aggregate model.")
            blocked = True
    if baseline.cogs is not None and baseline.cogs < 0:
        warnings.append("The period has negative net COGS from returns; this aggregate model requires a nonnegative observed net cost basket.")
        blocked = True
    if blocked:
        return SimulationCalculation(
            status="unavailable", simulated=None, differences=None,
            assumptions=assumptions, warnings=list(dict.fromkeys(warnings)),
        )

    # The checks above establish these inputs; no missing value is replaced by 0.
    assert baseline.revenue is not None and baseline.customer_shipping_revenue is not None
    assert baseline.cogs is not None and baseline.gross_profit is not None
    assert baseline.operating_profit is not None
    historical_orders = Decimal(baseline.order_count)
    historical_visitors = Decimal(baseline.visitors)
    visitors = _volume(historical_visitors * (ONE + params.visitor_change_pct / HUNDRED))
    historical_ratio = historical_orders / historical_visitors
    if params.expected_conversion_rate is None:
        # Multiplying by the visitor ratio preserves unchanged-scenario identity;
        # the report's rounded conversion percentage is deliberately not reused.
        expected_orders = _volume(historical_orders * (visitors / historical_visitors))
        conversion = _volume(historical_ratio * HUNDRED)
        conversion_source = "historical_ratio"
    else:
        conversion = _volume(params.expected_conversion_rate)
        expected_orders = _volume(visitors * params.expected_conversion_rate / HUNDRED)
        conversion_source = "user_assumption"
    volume_factor = expected_orders / historical_orders
    price_factor = (ONE + params.selling_price_change_pct / HUNDRED) * (ONE - params.discount_pct / HUNDRED)
    cost_factor = ONE + params.unit_cost_change_pct / HUNDRED
    merchandise = money((baseline.revenue - baseline.customer_shipping_revenue) * volume_factor * price_factor)
    customer_shipping = money(baseline.customer_shipping_revenue * volume_factor)
    revenue = merchandise + customer_shipping
    cogs = money(baseline.cogs * volume_factor * cost_factor)
    shipping = money(baseline.shipping_expenses * volume_factor)
    platform_fees = money(baseline.platform_fees * volume_factor)
    other = money(baseline.other_operating_expenses + params.additional_operating_expense_amount)
    profits = profit_totals(
        revenue=revenue, cogs=cogs, advertising=advertising,
        employee=baseline.employee_expenses, rent=baseline.rent_expenses,
        shipping=shipping, platform_fees=platform_fees, other=other,
    )
    simulated = SimulatedMetrics(
        revenue=revenue, cogs=cogs, **asdict(profits),
        advertising_expenditure=advertising,
        expected_orders=expected_orders, expected_visitors=visitors,
        assumed_conversion_rate=conversion, conversion_rate_source=conversion_source,
        customer_shipping_revenue=customer_shipping, shipping_expenses=shipping,
        platform_fees=platform_fees, employee_expenses=baseline.employee_expenses,
        rent_expenses=baseline.rent_expenses, other_operating_expenses=other,
    )
    revenue_difference = simulated.revenue - baseline.revenue
    profit_difference = simulated.operating_profit - baseline.operating_profit
    differences = SimulationDifferences(
        revenue=revenue_difference, operating_profit=profit_difference,
        gross_profit=simulated.gross_profit - baseline.gross_profit,
        orders=_volume(expected_orders - historical_orders),
        revenue_change_pct=(money(revenue_difference / baseline.revenue * HUNDRED) if baseline.revenue > 0 else None),
        profit_change_pct=(money(profit_difference / baseline.operating_profit * HUNDRED) if baseline.operating_profit > 0 else None),
    )
    if baseline.refunds is not None and baseline.refunds > 0:
        warnings.append("The baseline includes dated refunds, which may relate to earlier orders. The scenario scales this net refund/restock pattern with the selected period's expected orders.")
    if abs(params.selling_price_change_pct) >= 50 or params.discount_pct >= 50:
        warnings.append("The large price/discount assumption may be economically implausible; this model does not estimate the resulting customer response.")
    if abs(params.unit_cost_change_pct) >= 50:
        warnings.append("The large unit-cost assumption needs independent validation; supplier prices are not predicted.")
    if expected_orders == 0:
        warnings.append("The scenario assumes zero orders. Fixed operating expenses and the selected advertising budget remain payable.")
    elif volume_factor >= 3 or volume_factor <= Decimal("0.25"):
        warnings.append("The large change in order volume may exceed observed capacity or invalidate the fixed product-mix and fixed-cost assumptions.")
    if params.expected_conversion_rate is not None and (
        params.expected_conversion_rate >= 20 or params.expected_conversion_rate > historical_ratio * HUNDRED * 3
    ):
        warnings.append("The high conversion assumption is user supplied and is not supported by a customer-behaviour prediction.")
    if simulated.operating_profit < 0:
        warnings.append("The scenario produces an operating loss; the model preserves this result rather than assuming a profitable outcome.")
    if baseline.operating_profit <= 0:
        warnings.append("Profit change percentage is undefined for a zero or negative baseline operating profit; compare the absolute currency difference.")
    if baseline.revenue <= 0:
        warnings.append("Revenue change percentage is undefined for a zero or negative baseline revenue; compare the absolute currency difference.")
    return SimulationCalculation(
        status="ready", simulated=simulated, differences=differences,
        assumptions=assumptions, warnings=list(dict.fromkeys(warnings)),
    )
