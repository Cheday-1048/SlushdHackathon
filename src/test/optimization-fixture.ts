import { defaultOptimizationValues, optimizationFormSchema, optimizationSettings, type OptimizationRequest, type OptimizationResponse } from '../api/optimization';
import { simulationFixture } from './simulation-fixture';
export function optimizationFixture(request?: OptimizationRequest): OptimizationResponse {
  const single = simulationFixture();
  const baseline = { ...single.baseline, operating_profit: '20.00', operating_profit_margin: '20.00', operating_expenses: '10.00' };
  const applied = request ?? { start_date: baseline.reporting_period.start, end_date: baseline.reporting_period.end, ...optimizationSettings(optimizationFormSchema.parse(defaultOptimizationValues)) };
  return {
    model_version: 'aggregate-v1', search_version: 'grid-v1', snapshot_id: `sha256:${'b'.repeat(64)}`, store_id: single.store_id, currency: single.currency,
    reporting_period: baseline.reporting_period, baseline, request: applied, target_operating_profit: '22.00', target_profit_difference: '2.00', candidates_evaluated: 15, feasible_candidate_count: 3, status: 'feasible',
    recommendations: [{ id: '30000000-0000-4000-8000-000000000001', name: 'Strategy 1', status: 'ready', parameters: { ...single.parameters, selling_price_change_pct: '10', expected_conversion_rate: applied.behavioral_assumptions.expected_conversion_rate, visitor_change_pct: applied.behavioral_assumptions.visitor_change_pct, unit_cost_change_pct: applied.behavioral_assumptions.unit_cost_change_pct }, simulated: { ...single.simulated!, revenue: '110.00', operating_profit: '30.00', operating_profit_margin: '27.27' }, differences: { ...single.differences!, revenue: '10.00', operating_profit: '10.00', profit_change_pct: '50.00' }, assumptions: ['Conversion is fixed across all candidates.'], warnings: ['Customer response is unknown.'], constraints_satisfied: ['Operating profit reaches the target.', 'Price remains inside the allowed range.'] }],
    rejections: { below_profit_target: 12, below_minimum_margin: 0, unavailable: 0 }, assumptions: ['No causal response to price or advertising is inferred.'], constraint_explanations: ['Price changes stay inside the allowed interval.'], warnings: [],
  };
}
