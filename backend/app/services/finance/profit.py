"""Shared money, expense and profit definitions for reports and scenarios.

The callers supply already-rounded booked or hypothetical currency amounts.
Unknown revenue or COGS propagates to profit; known costs remain available.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")
HUNDRED = Decimal("100")


def money(value: Decimal) -> Decimal:
    """Round to the financial engine's two-decimal currency precision."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def margin(profit: Decimal | None, revenue: Decimal | None) -> Decimal | None:
    if profit is None or revenue is None or revenue <= 0:
        return None
    return money(profit / revenue * HUNDRED)


@dataclass(frozen=True)
class ProfitTotals:
    gross_profit: Decimal | None
    gross_profit_margin: Decimal | None
    contribution_profit: Decimal | None
    contribution_margin: Decimal | None
    operating_expenses: Decimal
    total_expenses: Decimal
    operating_profit: Decimal | None
    operating_profit_margin: Decimal | None


def profit_totals(
    *, revenue: Decimal | None, cogs: Decimal | None,
    advertising: Decimal, employee: Decimal, rent: Decimal,
    shipping: Decimal, platform_fees: Decimal, other: Decimal,
) -> ProfitTotals:
    """Apply the single financial definition used by reports and simulations.

    Operating expenses exclude advertising and COGS. Advertising enters total
    expenses exactly once; contribution deducts shipping, platform fees and ads.
    """
    operating_expenses = employee + rent + shipping + platform_fees + other
    total_expenses = operating_expenses + advertising
    gross_profit = None if revenue is None or cogs is None else revenue - cogs
    contribution = None if gross_profit is None else gross_profit - shipping - platform_fees - advertising
    operating_profit = None if gross_profit is None else gross_profit - total_expenses
    return ProfitTotals(
        gross_profit=gross_profit,
        gross_profit_margin=margin(gross_profit, revenue),
        contribution_profit=contribution,
        contribution_margin=margin(contribution, revenue),
        operating_expenses=operating_expenses,
        total_expenses=total_expenses,
        operating_profit=operating_profit,
        operating_profit_margin=margin(operating_profit, revenue),
    )
