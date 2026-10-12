"""Scenario comparison contracts sharing the existing simulation parameters."""

from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.dashboard import ReportingPeriod
from app.schemas.finance import FinanceSummary
from app.schemas.simulation import SimulationPeriod
from app.services.simulation import ScenarioParameters, SimulationCalculation

ScenarioName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class ScenarioConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: UUID
    name: ScenarioName
    parameters: ScenarioParameters = Field(default_factory=ScenarioParameters)


class ComparisonRequest(SimulationPeriod):
    scenarios: list[ScenarioConfiguration] = Field(min_length=2, max_length=4)

    @model_validator(mode="after")
    def unique_scenario_ids(self) -> "ComparisonRequest":
        if len({scenario.id for scenario in self.scenarios}) != len(self.scenarios):
            raise ValueError("Each scenario must have a unique identifier")
        return self


class ComparisonMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)

    orders_change_pct: Decimal | None
    gross_profit_change_pct: Decimal | None
    operating_expenses_difference: Decimal
    operating_expenses_change_pct: Decimal | None
    advertising_expenditure_difference: Decimal
    advertising_expenditure_change_pct: Decimal | None
    conversion_rate_difference_pp: Decimal | None
    operating_profit_margin_difference_pp: Decimal | None


class ScenarioResult(SimulationCalculation):
    id: UUID
    name: ScenarioName
    parameters: ScenarioParameters
    comparison: ComparisonMetrics | None


class SimulationComparison(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_version: Literal["aggregate-v1"] = "aggregate-v1"
    snapshot_id: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    store_id: UUID
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    reporting_period: ReportingPeriod
    baseline: FinanceSummary
    scenarios: list[ScenarioResult]
    assumptions: list[str]
    warnings: list[str]
