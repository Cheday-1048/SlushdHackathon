"""Read-only comparison of multiple assumptions against one financial snapshot."""

from decimal import Decimal, ROUND_HALF_UP, localcontext
from hashlib import sha256
import json
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.schemas.comparison import ComparisonMetrics, ComparisonRequest, ScenarioResult, SimulationComparison
from app.schemas.finance import FinanceSummary
from app.services.finance.profit import money
from app.services.financial_reporting import FinanceService
from app.services.simulation import SimulatedMetrics, SimulationParameterError, simulate
from app.services.simulation_reporting import SimulationValidationError

HUNDRED = Decimal("100")
RATE_PRECISION = Decimal("0.000001")


def baseline_snapshot_id(baseline: FinanceSummary) -> str:
    """Fingerprint all returned historical inputs, without random IDs or time."""
    canonical = json.dumps(baseline.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + sha256(canonical.encode("utf-8")).hexdigest()


def _change_pct(after: Decimal, before: Decimal | None) -> Decimal | None:
    if before is None or before <= 0:
        return None
    return money((after - before) / before * HUNDRED)


def comparison_metrics(baseline: FinanceSummary, projected: SimulatedMetrics) -> ComparisonMetrics:
    """Add deltas to existing engine results; no financial totals are recomputed."""
    with localcontext() as context:
        context.prec = 50
        context.rounding = ROUND_HALF_UP
        conversion_difference = None
        if baseline.conversion_rate is not None and baseline.visitors > 0:
            # Compare the same published six-place ratio as the simulation.
            # The report's two-place display must not create identity drift.
            historical_rate = (Decimal(baseline.order_count) / Decimal(baseline.visitors) * HUNDRED).quantize(RATE_PRECISION)
            conversion_difference = (projected.assumed_conversion_rate - historical_rate).quantize(RATE_PRECISION)
        margin_difference = None
        if projected.operating_profit_margin is not None and baseline.operating_profit_margin is not None:
            margin_difference = money(projected.operating_profit_margin - baseline.operating_profit_margin)
        return ComparisonMetrics(
            orders_change_pct=_change_pct(projected.expected_orders, Decimal(baseline.order_count)),
            gross_profit_change_pct=_change_pct(projected.gross_profit, baseline.gross_profit),
            operating_expenses_difference=money(projected.operating_expenses - baseline.operating_expenses),
            operating_expenses_change_pct=_change_pct(projected.operating_expenses, baseline.operating_expenses),
            advertising_expenditure_difference=money(projected.advertising_expenditure - baseline.advertising_expenditure),
            advertising_expenditure_change_pct=_change_pct(projected.advertising_expenditure, baseline.advertising_expenditure),
            conversion_rate_difference_pp=conversion_difference,
            operating_profit_margin_difference_pp=margin_difference,
        )


class SimulationComparisonService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def compare(self, request: ComparisonRequest) -> SimulationComparison:
        # One report and one request-level repeatable-read transaction serve all
        # scenarios. No repository call belongs inside the scenario loop.
        baseline = FinanceService(self.session).get_summary(request.start_date, request.end_date)
        snapshot_id = baseline_snapshot_id(baseline)
        results: list[ScenarioResult] = []
        warnings = list(baseline.data_completeness.warnings)
        assumptions: list[str] = []
        for scenario in request.scenarios:
            try:
                calculation = simulate(baseline, scenario.parameters)
            except SimulationParameterError as exc:
                raise SimulationValidationError(f'Scenario "{scenario.name}" ({scenario.id}): {exc}') from exc
            metrics = comparison_metrics(baseline, calculation.simulated) if calculation.simulated is not None else None
            scenario_warnings = list(calculation.warnings)
            if metrics is not None:
                for metric, label in (
                    (metrics.gross_profit_change_pct, "gross profit"),
                    (metrics.operating_expenses_change_pct, "operating expenses"),
                    (metrics.advertising_expenditure_change_pct, "advertising expenditure"),
                ):
                    if metric is None:
                        scenario_warnings.append(f"The percentage change in {label} is undefined for a zero, negative or unknown baseline; compare the absolute difference.")
            scenario_warnings = list(dict.fromkeys(scenario_warnings))
            results.append(ScenarioResult(
                **calculation.model_dump(exclude={"warnings"}), id=scenario.id, name=scenario.name,
                parameters=scenario.parameters, comparison=metrics, warnings=scenario_warnings,
            ))
            assumptions.extend(calculation.assumptions)
            warnings.extend(scenario_warnings)
        return SimulationComparison(
            snapshot_id=snapshot_id, store_id=baseline.store_id, currency=baseline.currency,
            reporting_period=baseline.reporting_period, baseline=baseline, scenarios=results,
            assumptions=list(dict.fromkeys(assumptions)), warnings=list(dict.fromkeys(warnings)),
        )


def get_simulation_comparison_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> SimulationComparisonService:
    return SimulationComparisonService(session)
