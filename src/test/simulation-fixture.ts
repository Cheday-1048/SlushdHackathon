import { defaultSimulationValues, type SimulationResponse } from '../api/simulation';
import { analyticsFixture } from './analytics-fixture';

export function simulationFixture(): SimulationResponse {
  const baseline = analyticsFixture().summary;
  return {
    model_version: 'aggregate-v1', status: 'ready', store_id: '10000000-0000-4000-8000-000000000001',
    currency: 'USD', reporting_period: baseline.reporting_period, baseline,
    parameters: { ...defaultSimulationValues, expected_conversion_rate: null },
    simulated: {
      revenue: '100.00', cogs: '60.00', gross_profit: '40.00', gross_profit_margin: '40.00',
      contribution_profit: '30.00', contribution_margin: '30.00', operating_expenses: '50.00',
      advertising_expenditure: '10.00', operating_profit: '-20.00', operating_profit_margin: '-20.00',
      expected_orders: '4.000000', expected_visitors: '100.000000', assumed_conversion_rate: '4.000000',
      conversion_rate_source: 'historical_ratio', customer_shipping_revenue: '0.00', shipping_expenses: '0.00',
      platform_fees: '0.00', employee_expenses: '50.00', rent_expenses: '0.00', other_operating_expenses: '0.00', total_expenses: '60.00',
    },
    differences: { revenue: '0.00', operating_profit: '0.00', gross_profit: '0.00', orders: '0.000000', revenue_change_pct: '0.00', profit_change_pct: null },
    assumptions: ['The historical basket and product mix remain unchanged.'], warnings: ['The scenario has a negative operating profit.'],
  };
}
