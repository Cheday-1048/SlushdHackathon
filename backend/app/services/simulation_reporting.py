"""Read-only orchestration from the existing finance report to a scenario."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.schemas.simulation import SimulationPreview, SimulationRequest
from app.services.financial_reporting import FinanceService
from app.services.simulation import SimulationParameterError, simulate


class SimulationValidationError(ValueError):
    """A scenario parameter cannot be applied to the selected baseline."""


class SimulationService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def preview(self, request: SimulationRequest) -> SimulationPreview:
        # The same store scoping, snapshot transaction, historical VAT/discount
        # rules and missing-data semantics as the financial report apply here.
        baseline = FinanceService(self.session).get_summary(request.start_date, request.end_date)
        try:
            calculation = simulate(baseline, request.parameters)
        except SimulationParameterError as exc:
            raise SimulationValidationError(str(exc)) from exc
        return SimulationPreview(
            **calculation.model_dump(), store_id=baseline.store_id,
            currency=baseline.currency, reporting_period=baseline.reporting_period,
            baseline=baseline, parameters=request.parameters,
        )


def get_simulation_service(session: Annotated[Session, Depends(get_db_session)]) -> SimulationService:
    return SimulationService(session)
