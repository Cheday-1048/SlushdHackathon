import type { AnalyticsDashboard } from '../api/schemas';

export function analyticsFixture(): AnalyticsDashboard {
  const complete = { is_complete: true, warnings: [], missing_vat_lines: 0, missing_refund_orders: 0, missing_shipping_orders: 0, missing_restock_refunds: 0, missing_order_items: 0, traffic_days: 1, expected_traffic_days: 1 };
  return {
    summary: {
      revenue: '100.00', cogs: '60.00', gross_profit: '40.00', operating_expenses: '50.00', advertising_expenditure: '10.00', total_expenses: '60.00', operating_profit: '-20.00', gross_profit_margin: '40.00', contribution_margin: '30.00', operating_profit_margin: '-20.00', average_order_value: '25.00', order_count: 4, visitors: 100, conversion_rate: '4.00', currency: 'USD', reporting_period: { start: '2026-09-01', end: '2026-09-01' }, data_source: { type: 'database_demo', description: 'Synthetic transactions stored in PostgreSQL.' }, data_completeness: complete,
    },
    store_timezone: 'America/New_York', as_of_date: '2026-10-12', selected_preset: 'custom',
    daily: [{ date: '2026-09-01', revenue: '100.00', order_count: 4, visitors: 100, conversion_rate: '4.00', operating_expenses: '50.00', advertising_expenditure: '10.00', total_expenses: '60.00', gross_profit: '40.00', operating_profit: '-20.00', data_completeness: complete }],
    products: [{ product_id: '10000000-0000-4000-8000-000000000001', name: 'Historical product', sku: 'SKU-1', units_sold: 4, units_returned: 0, revenue: '100.00', cogs: '60.00', gross_profit: '40.00', gross_profit_margin: '40.00', data_completeness: complete }],
    expenses: [
      { category: 'employee_costs', label: 'Employee costs', amount: '50.00' },
      { category: 'rent', label: 'Rent', amount: '0.00' },
      { category: 'shipping', label: 'Shipping', amount: '0.00' },
      { category: 'platform_fees', label: 'Platform fees', amount: '0.00' },
      { category: 'other_operating', label: 'Other operating expenses', amount: '0.00' },
      { category: 'advertising', label: 'Advertising', amount: '10.00' },
    ],
    unallocated_customer_shipping_revenue: '0.00', product_warnings: [],
  };
}
