"""Bounded, explicitly dated demo-store simulation API contracts."""

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dashboard import ReportingPeriod
from app.schemas.finance import FinanceSummary
from app.services.simulation import ScenarioParameters, SimulationCalculation


class SimulationPeriod(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_period(self) -> "SimulationPeriod":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.start_date == date.min or self.end_date == date.max:
            raise ValueError("Reporting dates must leave room for timezone boundary conversion")
        if (self.end_date - self.start_date).days >= 366:
            raise ValueError("Reporting periods cannot exceed 366 inclusive calendar days")
        return self


class SimulationRequest(SimulationPeriod):
    parameters: ScenarioParameters = Field(default_factory=ScenarioParameters)


class SimulationQuery(BaseModel):
    """Simulation endpoints accept no store selector or other query parameters."""

    model_config = ConfigDict(extra="forbid")


class SimulationPreview(SimulationCalculation):
    model_version: Literal["aggregate-v1"] = "aggregate-v1"
    store_id: UUID
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    reporting_period: ReportingPeriod
    baseline: FinanceSummary
    parameters: ScenarioParameters
