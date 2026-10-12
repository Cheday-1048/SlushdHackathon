from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas.catalog import ReportingQuery
from app.schemas.common import ErrorResponse
from app.schemas.finance import FinanceSummary
from app.services.financial_reporting import FinanceService, get_finance_service

router = APIRouter(prefix="/api/finance", tags=["finance"])


@router.get("/summary", response_model=FinanceSummary, responses={
    503: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse},
}, description="Historical demo-store financial metrics. Money and percentages are decimal strings; "
    "unknown dependent metrics are null. See docs/phase-03-financial-engine.md for definitions.")
def summary(service: Annotated[FinanceService, Depends(get_finance_service)],
            query: Annotated[ReportingQuery, Query()]) -> FinanceSummary:
    return service.get_summary(query.start_date, query.end_date)
