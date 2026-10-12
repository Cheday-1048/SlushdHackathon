"""Financial reporting use case joining scoped persistence to pure arithmetic."""

from datetime import date
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.demo import DEMO_PERIOD_END, DEMO_PERIOD_START
from app.db.session import get_db_session
from app.repositories.finance import financial_inputs
from app.repositories.retail import get_store
from app.schemas.dashboard import ReportingPeriod
from app.schemas.finance import FinanceSummary
from app.services.dashboard import demo_source
from app.services.finance import calculate_financials


class FinanceService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_summary(self, start_date: date | None = None, end_date: date | None = None) -> FinanceSummary:
        period = ReportingPeriod(start=start_date or DEMO_PERIOD_START, end=end_date or DEMO_PERIOD_END)
        store = get_store(self.session)
        result = calculate_financials(financial_inputs(self.session, store, period.start, period.end))
        return FinanceSummary(**result.model_dump(), store_id=store.id, currency=store.currency,
            reporting_period=period, data_source=demo_source())


def get_finance_service(session: Annotated[Session, Depends(get_db_session)]) -> FinanceService:
    return FinanceService(session)
