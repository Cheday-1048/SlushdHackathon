"""Finance response: Decimal values serialize as strings, unknowns as null."""

from uuid import UUID

from pydantic import Field

from app.schemas.dashboard import DataSource, ReportingPeriod
from app.services.finance import FinancialResult


class FinanceSummary(FinancialResult):
    store_id: UUID
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    reporting_period: ReportingPeriod
    data_source: DataSource
