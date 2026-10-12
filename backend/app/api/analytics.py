from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas.analytics import AnalyticsDashboard, AnalyticsQuery
from app.schemas.common import ErrorResponse
from app.services.analytics import AnalyticsService, get_analytics_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=AnalyticsDashboard, responses={
    503: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse},
}, description="One consistent demo-store summary, daily series, product performance, and expense breakdown. "
    "All money and percentages use the Phase 03 Decimal engine. Rolling periods include the current store-local "
    "day. Custom dates are inclusive and limited to 366 days. No parameters selects the synthetic demo period.")
def dashboard(service: Annotated[AnalyticsService, Depends(get_analytics_service)],
              query: Annotated[AnalyticsQuery, Query()]) -> AnalyticsDashboard:
    return service.get_dashboard(query)
