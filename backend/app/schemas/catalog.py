from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.db.demo import DEMO_PERIOD_END, DEMO_PERIOD_START
from app.schemas.dashboard import DataSource, Money, Percent, ReportingPeriod


class ReportingQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "ReportingQuery":
        if (self.start_date is None) != (self.end_date is None):
            raise ValueError("Provide both start_date and end_date, or neither")
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date or self.end_date == date.max:
                raise ValueError("Reporting dates must be ordered and end_date must be before 9999-12-31")
        return self

    def period(self) -> ReportingPeriod:
        return ReportingPeriod(start=self.start_date or DEMO_PERIOD_START, end=self.end_date or DEMO_PERIOD_END)


class PaginationQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class ExpenseQuery(ReportingQuery, PaginationQuery):
    pass


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    store_id: UUID
    sku: str
    name: str
    selling_price: Money
    unit_cost: Money
    vat_rate: Percent
    stock_quantity: int = Field(ge=0)
    created_at: datetime


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    store_id: UUID
    category: str
    amount: Money
    expense_date: date
    description: str
    created_at: datetime

    @computed_field
    @property
    def included_in_operating_expenses(self) -> bool:
        return self.category != "advertising"


class ProductList(BaseModel):
    items: list[ProductRead]
    total: int
    limit: int
    offset: int
    store_id: UUID
    data_source: DataSource


class ExpenseList(BaseModel):
    items: list[ExpenseRead]
    total: int
    limit: int
    offset: int
    store_id: UUID
    data_source: DataSource
    reporting_period: ReportingPeriod
