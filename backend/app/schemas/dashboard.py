from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Money = Annotated[Decimal, Field(ge=0, max_digits=16, decimal_places=2)]
Percent = Annotated[Decimal, Field(ge=0, le=100, decimal_places=2)]


class ReportingPeriod(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: date
    end: date

    @model_validator(mode="after")
    def validate_range(self) -> "ReportingPeriod":
        if self.end < self.start:
            raise ValueError("Reporting period end must be on or after start")
        return self


class DataSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["database_demo"] = "database_demo"
    description: str = Field(min_length=1)


class DashboardSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revenue: Money
    total_orders: int = Field(ge=0, strict=True)
    total_visitors: int = Field(ge=0, strict=True)
    conversion_rate: Percent = Field(description="Percentage of visitors who placed an order, rounded to two decimals")
    total_expenses: Money
    operating_expenses: Money
    advertising_expenditure: Money
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    reporting_period: ReportingPeriod
    data_source: DataSource

    @model_validator(mode="after")
    def consistent_metrics(self) -> "DashboardSummary":
        if self.total_orders > self.total_visitors:
            raise ValueError("Sample orders cannot exceed visitors")
        expected = (
            Decimal(self.total_orders) / Decimal(self.total_visitors) * 100
            if self.total_visitors else Decimal(0)
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if self.conversion_rate != expected:
            raise ValueError("Conversion rate must match orders divided by visitors")
        if self.total_expenses != self.operating_expenses + self.advertising_expenditure:
            raise ValueError("Total expenses must equal operating expenses plus advertising expenditure")
        return self
