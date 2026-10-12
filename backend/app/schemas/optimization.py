"""Explicit assumptions and bounded decisions for deterministic goal search."""

from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dashboard import ReportingPeriod
from app.schemas.finance import FinanceSummary
from app.schemas.simulation import SimulationPeriod
from app.services.simulation import ScenarioParameters, SimulationCalculation
from app.services.simulation.types import AdditionalExpense, DecimalInput, Percentage, PriceChange, VisitorChange

ProfitIncrease = Annotated[DecimalInput, Field(ge=0, le=10000, decimal_places=4)]
AxisPoints = Annotated[int, Field(strict=True, ge=2, le=5)]


class OptimizationValue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class GoalConstraints(OptimizationValue):
    min_selling_price_change_pct: PriceChange
    max_selling_price_change_pct: PriceChange
    max_discount_pct: Percentage
    max_advertising_increase_amount: AdditionalExpense
    max_additional_operating_expense_amount: AdditionalExpense
    minimum_operating_profit_margin_pct: Percentage | None = None

    @model_validator(mode="after")
    def ordered_price_range(self) -> "GoalConstraints":
        if self.min_selling_price_change_pct > self.max_selling_price_change_pct:
            raise ValueError("Minimum selling price change cannot exceed maximum selling price change")
        return self


class BehavioralAssumptions(OptimizationValue):
    conversion_mode: Literal["historical", "explicit"]
    expected_conversion_rate: Percentage | None = None
    visitor_change_pct: VisitorChange = Decimal("0")
    unit_cost_change_pct: PriceChange = Decimal("0")

    @model_validator(mode="after")
    def explicit_conversion_policy(self) -> "BehavioralAssumptions":
        if self.conversion_mode == "explicit" and self.expected_conversion_rate is None:
            raise ValueError("Explicit conversion mode requires expected_conversion_rate")
        if self.conversion_mode == "historical" and self.expected_conversion_rate is not None:
            raise ValueError("Historical conversion mode requires a null expected_conversion_rate")
        return self


class SearchParameters(OptimizationValue):
    price_points: AxisPoints = 5
    discount_points: AxisPoints = 3
    advertising_points: AxisPoints = 2
    expense_points: AxisPoints = 2
    max_candidates: Annotated[int, Field(strict=True, ge=1, le=625)] = 625


class GoalOptimizationRequest(SimulationPeriod):
    target_profit_increase_pct: ProfitIncrease
    constraints: GoalConstraints
    behavioral_assumptions: BehavioralAssumptions
    search: SearchParameters = Field(default_factory=SearchParameters)


class RecommendedStrategy(SimulationCalculation):
    id: UUID
    name: str
    parameters: ScenarioParameters
    constraints_satisfied: list[str]


class RejectionCounts(OptimizationValue):
    below_profit_target: int = Field(default=0, ge=0)
    below_minimum_margin: int = Field(default=0, ge=0)
    unavailable: int = Field(default=0, ge=0)


class GoalOptimizationResponse(OptimizationValue):
    model_version: Literal["aggregate-v1"] = "aggregate-v1"
    search_version: Literal["grid-v1"] = "grid-v1"
    snapshot_id: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    store_id: UUID
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    reporting_period: ReportingPeriod
    baseline: FinanceSummary
    request: GoalOptimizationRequest
    target_operating_profit: Decimal | None
    target_profit_difference: Decimal | None
    candidates_evaluated: int = Field(ge=0, le=625)
    feasible_candidate_count: int = Field(ge=0, le=625)
    status: Literal["feasible", "target_not_achievable", "unavailable"]
    recommendations: list[RecommendedStrategy] = Field(max_length=3)
    rejections: RejectionCounts
    assumptions: list[str]
    constraint_explanations: list[str]
    warnings: list[str]
