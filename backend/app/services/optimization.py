"""Bounded deterministic search using one unchanged simulation baseline."""

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP, localcontext
from itertools import product
import json
from typing import Annotated
from uuid import NAMESPACE_URL, uuid5

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.schemas.finance import FinanceSummary
from app.schemas.optimization import (
    GoalOptimizationRequest, GoalOptimizationResponse, RecommendedStrategy, RejectionCounts,
)
from app.services.financial_reporting import FinanceService
from app.services.simulation import ScenarioParameters, SimulationCalculation, simulate
from app.services.simulation_comparison import baseline_snapshot_id
from app.services.simulation_reporting import SimulationValidationError

ZERO = Decimal("0")
CENT = Decimal("0.01")
PERCENT_PRECISION = Decimal("0.0001")
SEARCH_ASSUMPTIONS = [
    "Recommendations are the highest operating-profit candidates in the tested grid, under the stated assumptions and constraints; they are not guaranteed real-world optimal strategies.",
    "Conversion, visitor change and unit-cost change are fixed user assumptions across all candidates. Conversion is not an independently optimized business decision.",
    "The model has no validated price-demand relationship: prices, discounts and advertising do not automatically change conversion or visitors. Actual customer responses remain unknown.",
    "Advertising increases and additional operating expenses are optional spending decisions. Without an assumed behavioral benefit, added spending reduces operating profit in this model.",
    "With conversion and traffic held fixed, the grid often favors the highest permitted price and the lowest discount or optional spend. This is a model consequence, not validated evidence that demand will remain unchanged.",
    "The grid includes range endpoints and evenly spaced rounded values. It can miss feasible or better strategies between tested points.",
    "Target operating profit is rounded upward to the next currency cent so a fractional-cent target is never reported as satisfied below its requested value.",
]


def grid_axis(start: Decimal, end: Decimal, points: int, precision: Decimal) -> tuple[Decimal, ...]:
    """Inclusive, ordered and deduplicated Decimal points; no binary floats."""
    with localcontext() as context:
        context.prec = 50
        return tuple(sorted({
            (start + (end - start) * Decimal(index) / Decimal(points - 1)).quantize(precision, rounding=ROUND_HALF_UP)
            for index in range(points)
        }))


def candidate_parameters(request: GoalOptimizationRequest) -> list[ScenarioParameters]:
    """Validate the actual deduplicated search size before loading any history."""
    bounds, search, behavior = request.constraints, request.search, request.behavioral_assumptions
    axes = (
        grid_axis(bounds.min_selling_price_change_pct, bounds.max_selling_price_change_pct, search.price_points, PERCENT_PRECISION),
        grid_axis(ZERO, bounds.max_discount_pct, search.discount_points, PERCENT_PRECISION),
        grid_axis(ZERO, bounds.max_advertising_increase_amount, search.advertising_points, CENT),
        grid_axis(ZERO, bounds.max_additional_operating_expense_amount, search.expense_points, CENT),
    )
    size = 1
    for axis in axes:
        size *= len(axis)
    if size > search.max_candidates:
        raise SimulationValidationError(
            f"The requested grid contains {size} distinct candidates, exceeding max_candidates={search.max_candidates}. Reduce grid points or narrow the ranges."
        )
    return [ScenarioParameters(
        selling_price_change_pct=price, discount_pct=discount,
        advertising_budget_change_amount=advertising, additional_operating_expense_amount=expense,
        expected_conversion_rate=behavior.expected_conversion_rate,
        visitor_change_pct=behavior.visitor_change_pct, unit_cost_change_pct=behavior.unit_cost_change_pct,
    ) for price, discount, advertising, expense in product(*axes)]


def _constraints(request: GoalOptimizationRequest, target: Decimal | None) -> list[str]:
    bounds = request.constraints
    descriptions = [
        f"Selling price change stays between {bounds.min_selling_price_change_pct}% and {bounds.max_selling_price_change_pct}% inclusive.",
        f"Additional discount stays between 0% and {bounds.max_discount_pct}% inclusive.",
        f"Advertising increase stays between 0 and {bounds.max_advertising_increase_amount} in store currency.",
        f"Additional operating expenses stay between 0 and {bounds.max_additional_operating_expense_amount} in store currency.",
        "Rejected candidates are counted once: unavailable first, then below profit target, then below minimum margin.",
    ]
    if target is not None:
        descriptions.append(f"Expected operating profit must be at least {target} in store currency.")
    if bounds.minimum_operating_profit_margin_pct is not None:
        descriptions.append(f"Published operating profit margin must be at least {bounds.minimum_operating_profit_margin_pct}%; an undefined margin fails this constraint.")
    else:
        descriptions.append("No minimum operating profit margin was requested.")
    return descriptions


def _stable_id(snapshot_id: str, parameters: ScenarioParameters):
    # Normalize Decimal scales so numerically equal requests keep the same IDs.
    values = {
        key: (format(value.normalize(), "f") if isinstance(value, Decimal) else value)
        for key, value in parameters.model_dump().items()
    }
    canonical = json.dumps(values, sort_keys=True, separators=(",", ":"))
    return uuid5(NAMESPACE_URL, f"retail-decision-lab:aggregate-v1:grid-v1:{snapshot_id}:{canonical}")


def optimize_baseline(baseline: FinanceSummary, request: GoalOptimizationRequest) -> GoalOptimizationResponse:
    """Pure search; every candidate receives the same immutable financial report."""
    parameters = candidate_parameters(request)
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_UP
        return _optimize(baseline, request, parameters)


def _optimize(baseline: FinanceSummary, request: GoalOptimizationRequest,
              parameters: list[ScenarioParameters]) -> GoalOptimizationResponse:
    snapshot_id = baseline_snapshot_id(baseline)
    warnings = list(baseline.data_completeness.warnings)
    assumptions = list(SEARCH_ASSUMPTIONS)
    assumptions.append(
        "All candidates retain the exact historical orders-to-visitors conversion ratio."
        if request.behavioral_assumptions.conversion_mode == "historical" else
        f"All candidates use the explicit user-supplied conversion rate of {request.behavioral_assumptions.expected_conversion_rate}%."
    )
    metadata = dict(
        snapshot_id=snapshot_id, store_id=baseline.store_id, currency=baseline.currency,
        reporting_period=baseline.reporting_period, baseline=baseline, request=request,
    )
    if baseline.operating_profit is None or baseline.operating_profit <= 0 or not baseline.data_completeness.is_complete:
        warnings.append("Goal optimization is unavailable: a percentage profit-increase target requires a complete baseline with strictly positive operating profit. Zero, negative or unknown baseline profit cannot define this target.")
        return GoalOptimizationResponse(
            **metadata, target_operating_profit=None, target_profit_difference=None,
            candidates_evaluated=0, feasible_candidate_count=0, status="unavailable", recommendations=[],
            rejections=RejectionCounts(), assumptions=assumptions,
            constraint_explanations=_constraints(request, None), warnings=list(dict.fromkeys(warnings)),
        )
    target = (baseline.operating_profit * (Decimal("1") + request.target_profit_increase_pct / Decimal("100"))).quantize(CENT, rounding=ROUND_CEILING)
    rejected = {"below_profit_target": 0, "below_minimum_margin": 0, "unavailable": 0}
    feasible: list[tuple[ScenarioParameters, SimulationCalculation]] = []
    unavailable_warnings: list[str] = []
    for params in parameters:
        calculation = simulate(baseline, params)
        if calculation.status != "ready" or calculation.simulated is None:
            rejected["unavailable"] += 1
            unavailable_warnings.extend(calculation.warnings)
            continue
        if calculation.simulated.operating_profit < target:
            rejected["below_profit_target"] += 1
            continue
        minimum = request.constraints.minimum_operating_profit_margin_pct
        actual_margin = calculation.simulated.operating_profit_margin
        if minimum is not None and (actual_margin is None or actual_margin < minimum):
            rejected["below_minimum_margin"] += 1
            continue
        feasible.append((params, calculation))
    feasible.sort(key=lambda entry: (
        -entry[1].simulated.operating_profit,
        entry[0].selling_price_change_pct, entry[0].discount_pct,
        entry[0].advertising_budget_change_amount, entry[0].additional_operating_expense_amount,
    ))
    explanations = _constraints(request, target)
    recommendations = [RecommendedStrategy(
        **calculation.model_dump(), id=_stable_id(snapshot_id, params), name=f"Strategy {index}",
        parameters=params, constraints_satisfied=[text for text in explanations if not text.startswith("Rejected candidates")],
    ) for index, (params, calculation) in enumerate(feasible[:3], start=1)]
    for recommendation in recommendations:
        assumptions.extend(recommendation.assumptions)
    if feasible:
        status = "feasible"
    elif rejected["unavailable"] == len(parameters):
        status = "unavailable"
        warnings.extend(unavailable_warnings)
        warnings.append("No candidate can be evaluated with this unsupported historical baseline and the supplied behavioral assumptions.")
    else:
        status = "target_not_achievable"
        warnings.append("Target not achievable under current assumptions and evaluated grid within the requested constraints.")
    return GoalOptimizationResponse(
        **metadata, target_operating_profit=target, target_profit_difference=target - baseline.operating_profit,
        candidates_evaluated=len(parameters), feasible_candidate_count=len(feasible), status=status,
        recommendations=recommendations, rejections=RejectionCounts(**rejected),
        assumptions=list(dict.fromkeys(assumptions)), constraint_explanations=explanations,
        warnings=list(dict.fromkeys(warnings)),
    )


class GoalOptimizationService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def optimize(self, request: GoalOptimizationRequest) -> GoalOptimizationResponse:
        candidate_parameters(request)  # Reject an oversized grid before any database query.
        baseline = FinanceService(self.session).get_summary(request.start_date, request.end_date)
        return optimize_baseline(baseline, request)


def get_goal_optimization_service(session: Annotated[Session, Depends(get_db_session)]) -> GoalOptimizationService:
    return GoalOptimizationService(session)
