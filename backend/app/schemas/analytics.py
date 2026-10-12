"""One typed analytics snapshot with an explicitly bounded reporting interval."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.db.demo import DEMO_PERIOD_END, DEMO_PERIOD_START
from app.schemas.dashboard import ReportingPeriod
from app.schemas.finance import FinanceSummary
from app.services.finance.types import DataCompleteness

Preset = Literal["last_7_days", "last_30_days", "last_90_days"]
SelectedPreset = Literal["demo", "custom", "last_7_days", "last_30_days", "last_90_days"]


class AnalyticsQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preset: Preset | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_period(self) -> "AnalyticsQuery":
        if self.preset is not None and (self.start_date is not None or self.end_date is not None):
            raise ValueError("Provide a preset or both custom dates, not both")
        if (self.start_date is None) != (self.end_date is None):
            raise ValueError("Provide both start_date and end_date, or neither")
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date")
            if self.start_date == date.min or self.end_date == date.max:
                raise ValueError("Reporting dates must leave room for timezone boundary conversion")
            if (self.end_date - self.start_date).days >= 366:
                raise ValueError("Reporting periods cannot exceed 366 inclusive calendar days")
        return self

    @property
    def selected_preset(self) -> SelectedPreset:
        return self.preset or ("custom" if self.start_date is not None else "demo")

    def period(self, as_of_date: date) -> ReportingPeriod:
        if self.preset:
            days = {"last_7_days": 7, "last_30_days": 30, "last_90_days": 90}[self.preset]
            return ReportingPeriod(start=as_of_date - timedelta(days=days - 1), end=as_of_date)
        return ReportingPeriod(start=self.start_date or DEMO_PERIOD_START, end=self.end_date or DEMO_PERIOD_END)


class DailyAnalytics(BaseModel):
    date: date
    revenue: Decimal | None
    order_count: int = Field(ge=0)
    visitors: int | None = Field(ge=0)
    conversion_rate: Decimal | None
    operating_expenses: Decimal
    advertising_expenditure: Decimal
    total_expenses: Decimal
    gross_profit: Decimal | None
    operating_profit: Decimal | None
    data_completeness: DataCompleteness


class ProductAnalytics(BaseModel):
    product_id: UUID
    name: str
    sku: str
    units_sold: int = Field(ge=0)
    units_returned: int = Field(ge=0)
    revenue: Decimal | None
    cogs: Decimal | None
    gross_profit: Decimal | None
    gross_profit_margin: Decimal | None
    data_completeness: DataCompleteness


class ExpenseAnalytics(BaseModel):
    category: Literal["employee_costs", "rent", "shipping", "platform_fees", "other_operating", "advertising"]
    label: str
    amount: Decimal = Field(ge=0)


class AnalyticsDashboard(BaseModel):
    summary: FinanceSummary
    store_timezone: str
    as_of_date: date
    selected_preset: SelectedPreset
    daily: list[DailyAnalytics]
    products: list[ProductAnalytics]
    expenses: list[ExpenseAnalytics]
    unallocated_customer_shipping_revenue: Decimal | None
    product_warnings: list[str]
