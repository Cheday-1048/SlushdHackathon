from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas.common import ErrorResponse
from app.schemas.optimization import GoalOptimizationRequest, GoalOptimizationResponse
from app.schemas.simulation import SimulationQuery
from app.services.optimization import GoalOptimizationService, get_goal_optimization_service

router = APIRouter(prefix="/api/optimization", tags=["optimization"])


@router.post("/goal", response_model=GoalOptimizationResponse, responses={
    503: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse},
}, description="Search at most 625 deterministic strategy candidates against one read-only demo-store financial snapshot. "
    "Prices, discounts and optional spend are decisions; conversion, traffic and unit cost remain explicit fixed assumptions. "
    "No causal demand response is inferred. Return up to three highest operating-profit feasible grid candidates, "
    "or an explicit target_not_achievable/unavailable status. Percentage goals require positive baseline operating profit. "
    "Money uses Decimal strings and targets round upward to cents; searches above the requested cap return 422.")
def optimize_goal(request: GoalOptimizationRequest,
                  service: Annotated[GoalOptimizationService, Depends(get_goal_optimization_service)],
                  query: Annotated[SimulationQuery, Query()]) -> GoalOptimizationResponse:
    return service.optimize(request)
