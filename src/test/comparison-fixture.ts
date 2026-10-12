import type { ComparisonRequest, ComparisonResponse } from '../api/comparison';
import { simulationFixture } from './simulation-fixture';

export function comparisonFixture(request?: ComparisonRequest): ComparisonResponse {
  const single = simulationFixture();
  const configurations = request?.scenarios ?? [
    { id: '20000000-0000-4000-8000-000000000001', name: 'Scenario A', parameters: single.parameters },
    { id: '20000000-0000-4000-8000-000000000002', name: 'Scenario B', parameters: single.parameters },
  ];
  return {
    model_version: single.model_version, snapshot_id: `sha256:${'a'.repeat(64)}`, store_id: single.store_id, currency: single.currency,
    reporting_period: single.reporting_period, baseline: single.baseline,
    scenarios: configurations.map((scenario) => ({ ...single, ...scenario, status: 'ready', simulated: single.simulated!, differences: single.differences!, comparison: {
      orders_change_pct: '0.00', gross_profit_change_pct: '0.00', operating_expenses_difference: '0.00', operating_expenses_change_pct: '0.00',
      advertising_expenditure_difference: '0.00', advertising_expenditure_change_pct: '0.00', conversion_rate_difference_pp: '0.000000', operating_profit_margin_difference_pp: '0.00',
    } })),
    assumptions: ['Every scenario shares the same historical baseline.'], warnings: [],
  };
}
