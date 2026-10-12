"""Validated value objects for the database-independent financial engine.

VAT rates are percentages (``20`` means 20%). Monetary inputs accept Decimal,
integer, or decimal string values; binary floats are rejected before coercion.
Unknown tax semantics are represented explicitly by ``None``.
"""

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator


def _reject_float(value: object) -> object:
    if isinstance(value, (float, bool)):
        raise ValueError("Use Decimal, a decimal string, or an integer for monetary values and VAT rates")
    return value


Amount = Annotated[Decimal, BeforeValidator(_reject_float), Field(ge=0, max_digits=24)]
VatRate = Annotated[Decimal, BeforeValidator(_reject_float), Field(ge=0, le=100)]
NonnegativeCount = Annotated[int, Field(ge=0, strict=True)]


class FinancialValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SaleLine(FinancialValue):
    quantity: int = Field(gt=0, strict=True)
    unit_price: Amount
    discount_amount: Amount
    vat_rate: VatRate
    unit_cost_snapshot: Amount
    price_includes_vat: bool | None = Field(strict=True)

    @model_validator(mode="after")
    def discount_within_line(self) -> "SaleLine":
        if self.discount_amount > self.unit_price * self.quantity:
            raise ValueError("Line discount cannot exceed quantity times unit price")
        return self


class RefundLine(FinancialValue):
    amount: Amount
    amount_includes_vat: bool | None = Field(strict=True)
    vat_rate: VatRate
    quantity_returned: NonnegativeCount
    quantity_restocked: NonnegativeCount | None
    unit_cost_snapshot: Amount

    @model_validator(mode="after")
    def restock_within_return(self) -> "RefundLine":
        if self.quantity_restocked is not None and self.quantity_restocked > self.quantity_returned:
            raise ValueError("Restocked quantity cannot exceed returned quantity")
        return self


class ShippingCharge(FinancialValue):
    amount: Amount | None
    vat_rate: VatRate | None
    price_includes_vat: bool | None = Field(strict=True)


class ExpenseEntry(FinancialValue):
    category: Literal[
        "advertising", "employee_costs", "rent", "shipping", "platform_fees", "software", "miscellaneous"
    ]
    amount: Amount


class FinancialInput(FinancialValue):
    sales: list[SaleLine] = Field(default_factory=list)
    refunds: list[RefundLine] = Field(default_factory=list)
    shipping: list[ShippingCharge] = Field(default_factory=list)
    expenses: list[ExpenseEntry] = Field(default_factory=list)
    ad_spend: list[Amount] = Field(default_factory=list)
    order_count: NonnegativeCount
    visitors: NonnegativeCount
    traffic_days: NonnegativeCount
    period_days: NonnegativeCount
    missing_refund_orders: NonnegativeCount = 0
    missing_order_items: NonnegativeCount = 0
    extra_warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def traffic_within_period(self) -> "FinancialInput":
        if self.traffic_days > self.period_days:
            raise ValueError("Traffic days cannot exceed reporting-period days")
        return self


class DataCompleteness(FinancialValue):
    is_complete: bool
    warnings: list[str]
    missing_vat_lines: NonnegativeCount
    missing_refund_orders: NonnegativeCount
    missing_shipping_orders: NonnegativeCount
    missing_restock_refunds: NonnegativeCount
    missing_order_items: NonnegativeCount
    traffic_days: NonnegativeCount
    expected_traffic_days: NonnegativeCount


class FinancialResult(FinancialValue):
    gross_sales: Decimal | None
    discounts: Decimal | None
    vat_exclusive_sales_revenue: Decimal | None
    customer_shipping_revenue: Decimal | None
    vat_collected_sales: Decimal | None
    refunds: Decimal | None
    vat_refunded: Decimal | None
    net_vat_collected: Decimal | None
    net_sales_revenue: Decimal | None
    revenue: Decimal | None
    cogs_before_returns: Decimal | None
    cogs_reversed: Decimal | None
    cogs: Decimal | None
    gross_profit: Decimal | None
    gross_profit_margin: Decimal | None
    contribution_profit: Decimal | None
    contribution_margin: Decimal | None
    advertising_expenditure: Decimal
    employee_expenses: Decimal
    rent_expenses: Decimal
    shipping_expenses: Decimal
    platform_fees: Decimal
    other_operating_expenses: Decimal
    operating_expenses: Decimal
    total_expenses: Decimal
    operating_profit: Decimal | None
    operating_profit_margin: Decimal | None
    average_order_value: Decimal | None
    conversion_rate: Decimal | None
    break_even_order_quantity: int | None
    order_count: NonnegativeCount
    visitors: NonnegativeCount
    data_completeness: DataCompleteness
