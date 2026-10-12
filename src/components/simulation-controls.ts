import type { SimulationFormValues } from '../api/simulation';

export const simulationControls: { key: keyof SimulationFormValues; label: string; help: string }[] = [
  { key: 'selling_price_change_pct', label: 'Selling price change (%)', help: '−100 to 1,000%. Applied to historical net merchandise prices.' },
  { key: 'discount_pct', label: 'Additional discount (%)', help: '0 to 100%. Applied after the selling price change.' },
  { key: 'expected_conversion_rate', label: 'Expected conversion rate (%)', help: '0 to 100%. Leave blank to keep the exact historical orders-to-visitors ratio.' },
  { key: 'visitor_change_pct', label: 'Visitor count change (%)', help: '−100 to 10,000%. This is your traffic assumption.' },
  { key: 'unit_cost_change_pct', label: 'Product unit cost change (%)', help: '−100 to 1,000%. Applied to historical product costs.' },
  { key: 'advertising_budget_change_amount', label: 'Advertising budget change', help: 'Amount added to or subtracted from the historical budget. The resulting budget must be nonnegative.' },
  { key: 'additional_operating_expense_amount', label: 'Additional operating expense', help: 'Nonnegative amount added to fixed operating costs for this period.' },
];
