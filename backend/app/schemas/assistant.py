"""Small, stateless assistant contract; all tool arguments use domain validation."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.finance import FinanceSummary
from app.schemas.optimization import GoalOptimizationRequest, GoalOptimizationResponse
from app.schemas.simulation import SimulationPeriod


class AssistantChatRequest(SimulationPeriod):
    message: str = Field(strict=True, min_length=1, max_length=2000)

    @field_validator("message", mode="before")
    @classmethod
    def trim_message(cls, value):
        return value.strip() if isinstance(value, str) else value


class StoreMetricsArguments(SimulationPeriod):
    pass


class GoalOptimizationArguments(GoalOptimizationRequest):
    """Reuse every existing optimizer bound, including the finite search cap."""

    @model_validator(mode="before")
    @classmethod
    def controlled_decimals_and_search(cls, value):
        if not isinstance(value, dict):
            return value
        if "search" in value:
            raise ValueError("Assistant tools use the fixed default search configuration")
        if not isinstance(value.get("target_profit_increase_pct"), str):
            raise ValueError("Tool decimal arguments must be strings")
        for section, nullable, nondecimal in (
            ("constraints", {"minimum_operating_profit_margin_pct"}, set()),
            ("behavioral_assumptions", {"expected_conversion_rate"}, {"conversion_mode"}),
        ):
            fields = value.get(section)
            if not isinstance(fields, dict):
                continue  # The existing domain schema will report the invalid object.
            for name, argument in fields.items():
                if name not in nondecimal and not isinstance(argument, str) and not (name in nullable and argument is None):
                    raise ValueError("Tool decimal arguments must be strings")
        return value


class AssistantChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    metrics: FinanceSummary | None = None
    optimization: GoalOptimizationResponse | None = None
    tools_used: list[Literal["get_store_metrics", "run_goal_optimization"]] = Field(max_length=2)
