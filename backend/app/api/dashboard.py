from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas.common import ErrorResponse
from app.schemas.catalog import ReportingQuery
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard import DashboardService, get_dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary, deprecated=True,
    description="Phase 02 compatibility contract: completed merchandise sales under its original "
    "tax-exclusive convention, without refund or customer shipping adjustments. "
    "Use /api/finance/summary for VAT-aware financial reporting and completeness indicators.",
    responses={503: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}})
def summary(service: Annotated[DashboardService, Depends(get_dashboard_service)], query: Annotated[ReportingQuery, Query()]) -> DashboardSummary:
    return service.get_summary(query.start_date, query.end_date)
