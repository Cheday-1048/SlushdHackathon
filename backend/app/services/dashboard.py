from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.demo import DEMO_PERIOD_END, DEMO_PERIOD_START
from app.db.session import get_db_session
from app.repositories.retail import dashboard_totals, get_store
from app.schemas.dashboard import DashboardSummary, DataSource, ReportingPeriod


def demo_source() -> DataSource:
    return DataSource(description="Synthetic demo store data persisted in PostgreSQL. All metrics are computed from database records; no live merchant is connected.")


class DashboardService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_summary(self, start_date: date | None = None, end_date: date | None = None) -> DashboardSummary:
        period = ReportingPeriod(start=start_date or DEMO_PERIOD_START, end=end_date or DEMO_PERIOD_END)
        store = get_store(self.session)
        totals = dashboard_totals(self.session, store, period.start, period.end)
        conversion = (Decimal(totals["total_orders"]) / totals["total_visitors"] * 100
                      if totals["total_visitors"] else Decimal(0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return DashboardSummary(**totals, conversion_rate=conversion,
            total_expenses=totals["operating_expenses"] + totals["advertising_expenditure"],
            currency=store.currency, reporting_period=period, data_source=demo_source())


def get_dashboard_service(session: Annotated[Session, Depends(get_db_session)]) -> DashboardService:
    return DashboardService(session)
