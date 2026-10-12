from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas.common import ErrorResponse
from app.schemas.comparison import ComparisonRequest, SimulationComparison
from app.schemas.simulation import SimulationPreview, SimulationQuery, SimulationRequest
from app.services.simulation_comparison import SimulationComparisonService, get_simulation_comparison_service
from app.services.simulation_reporting import SimulationService, get_simulation_service

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


@router.post("/preview", response_model=SimulationPreview, responses={
    503: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse},
}, description="Read-only hypothetical aggregate scenario for the configured demo store. "
    "Dates are inclusive and limited to 366 days. Scenario amounts use decimal strings in the store currency. "
    "Conversion is an explicit user assumption or the exact historical ratio; it is not predicted. "
    "Incomplete or unsupported baselines return status unavailable with null projections and warnings. "
    "Invalid parameters, including an advertising change that makes its budget negative, return 422.")
def preview(request: SimulationRequest,
            service: Annotated[SimulationService, Depends(get_simulation_service)],
            query: Annotated[SimulationQuery, Query()]) -> SimulationPreview:
    return service.preview(request)


@router.post("/compare", response_model=SimulationComparison, responses={
    503: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 500: {"model": ErrorResponse},
}, description="Compare two to four named hypothetical scenarios against one shared historical baseline. "
    "The baseline is loaded once in the read-only snapshot transaction. All financial projections reuse "
    "the existing aggregate-v1 simulation engine; no real-world experiment or automatic ranking occurs. "
    "Responses retain the full baseline, its deterministic SHA-256 fingerprint, applied parameters and scenario IDs. "
    "Missing inputs return unavailable scenario results. Undefined percentage changes are null. "
    "Invalid parameters or duplicate scenario IDs return 422.")
def compare(request: ComparisonRequest,
            service: Annotated[SimulationComparisonService, Depends(get_simulation_comparison_service)],
            query: Annotated[SimulationQuery, Query()]) -> SimulationComparison:
    return service.compare(request)
