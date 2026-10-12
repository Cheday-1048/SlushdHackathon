"""Validated, database-independent contracts for aggregate sales scenarios.

Percent inputs use percentage points (10 means 10%). Monetary changes use the
baseline store currency. Decimal strings avoid binary-float financial inputs.
"""

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def _exact_decimal(value: object) -> object:
    if isinstance(value, (float, bool)):
        raise ValueError("Use a decimal string, Decimal, or integer for scenario values")
    return value


DecimalInput = Annotated[
    Decimal, BeforeValidator(_exact_decimal), Field(max_digits=16, allow_inf_nan=False),
]
PriceChange = Annotated[DecimalInput, Field(ge=-100, le=1000, decimal_places=4)]
VisitorChange = Annotated[DecimalInput, Field(ge=-100, le=10000, decimal_places=4)]
Percentage = Annotated[DecimalInput, Field(ge=0, le=100, decimal_places=4)]
CurrencyChange = Annotated[DecimalInput, Field(decimal_places=2)]
AdditionalExpense = Annotated[CurrencyChange, Field(ge=0)]


class SimulationValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class ScenarioParameters(SimulationValue):
    selling_price_change_pct: PriceChange = Decimal("0")
    discount_pct: Percentage = Decimal("0")
    expected_conversion_rate: Percentage | None = None
    visitor_change_pct: VisitorChange = Decimal("0")
    unit_cost_change_pct: PriceChange = Decimal("0")
    advertising_budget_change_amount: CurrencyChange = Decimal("0.00")
    additional_operating_expense_amount: AdditionalExpense = Decimal("0.00")


class SimulatedMetrics(SimulationValue):
    revenue: Decimal
    cogs: Decimal
    gross_profit: Decimal
    gross_profit_margin: Decimal | None
    contribution_profit: Decimal
    contribution_margin: Decimal | None
    operating_expenses: Decimal
    advertising_expenditure: Decimal
    operating_profit: Decimal
    operating_profit_margin: Decimal | None
    expected_orders: Decimal
    expected_visitors: Decimal
    assumed_conversion_rate: Decimal
    conversion_rate_source: Literal["historical_ratio", "user_assumption"]
    customer_shipping_revenue: Decimal
    shipping_expenses: Decimal
    platform_fees: Decimal
    employee_expenses: Decimal
    rent_expenses: Decimal
    other_operating_expenses: Decimal
    total_expenses: Decimal


class SimulationDifferences(SimulationValue):
    revenue: Decimal
    operating_profit: Decimal
    gross_profit: Decimal
    orders: Decimal
    revenue_change_pct: Decimal | None
    profit_change_pct: Decimal | None


class SimulationCalculation(SimulationValue):
    status: Literal["ready", "unavailable"]
    simulated: SimulatedMetrics | None
    differences: SimulationDifferences | None
    assumptions: list[str]
    warnings: list[str]
