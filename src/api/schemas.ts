import { z } from 'zod';

// Pydantic serializes Decimal as strings to preserve exact financial values.
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/, { abort: true }).refine((value) => Number.isFinite(Number(value)));
const date = z.iso.date();

function cents(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export const dashboardSummarySchema = z.object({
  revenue: money,
  total_orders: z.number().int().nonnegative(),
  total_visitors: z.number().int().nonnegative(),
  conversion_rate: money.refine((value) => Number(value) <= 100),
  total_expenses: money,
  operating_expenses: money,
  advertising_expenditure: money,
  currency: z.string().regex(/^[A-Z]{3}$/),
  reporting_period: z.object({ start: date, end: date }),
  data_source: z.object({ type: z.literal('database_demo'), description: z.string().min(1) }),
}).superRefine((data, ctx) => {
  if (data.reporting_period.end < data.reporting_period.start) ctx.addIssue({ code: 'custom', message: 'Invalid reporting period' });
  // Integer arithmetic matches the backend's Decimal ROUND_HALF_UP at two places.
  const visitors = BigInt(data.total_visitors);
  const expected = visitors ? (BigInt(data.total_orders) * 20000n + visitors) / (visitors * 2n) : 0n;
  if (data.total_orders > data.total_visitors || expected !== cents(data.conversion_rate)) ctx.addIssue({ code: 'custom', message: 'Inconsistent conversion metrics' });
  if (cents(data.operating_expenses) + cents(data.advertising_expenditure) !== cents(data.total_expenses)) ctx.addIssue({ code: 'custom', message: 'Inconsistent expense totals' });
}).transform((data) => ({
  ...data,
  revenue: Number(data.revenue),
  conversion_rate: Number(data.conversion_rate),
  total_expenses: Number(data.total_expenses),
  operating_expenses: Number(data.operating_expenses),
  advertising_expenditure: Number(data.advertising_expenditure),
}));

export const healthSchema = z.object({ status: z.literal('ok'), service: z.string().min(1) });
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type Health = z.infer<typeof healthSchema>;

// Keep exact server-calculated values as strings. Null means unavailable, not zero.
const financialDecimal = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/, { abort: true }).refine((value) => Number.isFinite(Number(value)));
const financialAmount = financialDecimal.nullable();
const financialCost = money.nullable();
const count = z.number().int().nonnegative();

export const dataCompletenessSchema = z.object({
  is_complete: z.boolean(),
  warnings: z.array(z.string().min(1)),
  missing_vat_lines: count,
  missing_refund_orders: count,
  missing_shipping_orders: count,
  missing_restock_refunds: count,
  missing_order_items: count,
  traffic_days: count,
  expected_traffic_days: count,
});

export const financeSummarySchema = z.object({
  revenue: financialAmount,
  cogs: financialAmount,
  gross_profit: financialAmount,
  operating_expenses: money,
  advertising_expenditure: money,
  total_expenses: money,
  operating_profit: financialAmount,
  gross_profit_margin: financialAmount,
  contribution_margin: financialAmount,
  operating_profit_margin: financialAmount,
  average_order_value: financialAmount,
  order_count: count,
  visitors: count,
  conversion_rate: financialCost,
  currency: z.string().regex(/^[A-Z]{3}$/),
  reporting_period: z.object({ start: date, end: date }),
  data_source: z.object({ type: z.literal('database_demo'), description: z.string().min(1) }),
  data_completeness: dataCompletenessSchema,
}).superRefine((data, ctx) => {
  if (data.reporting_period.end < data.reporting_period.start) ctx.addIssue({ code: 'custom', message: 'Invalid reporting period' });
});

export type FinanceSummary = z.infer<typeof financeSummarySchema>;

export const reportingFilterSchema = z.discriminatedUnion('preset', [
  z.object({ preset: z.enum(['demo', 'last_7_days', 'last_30_days', 'last_90_days']) }).strict(),
  z.object({ preset: z.literal('custom'), start_date: date, end_date: date }).strict(),
]).superRefine((filter, ctx) => {
  if (filter.preset !== 'custom') return;
  if (filter.end_date < filter.start_date) ctx.addIssue({ code: 'custom', message: 'End date must be on or after start date.' });
  const days = (Date.parse(`${filter.end_date}T00:00:00Z`) - Date.parse(`${filter.start_date}T00:00:00Z`)) / 86400000 + 1;
  if (days > 366) ctx.addIssue({ code: 'custom', message: 'Choose a reporting period of 366 days or fewer.' });
  if (filter.start_date === '0001-01-01') ctx.addIssue({ code: 'custom', message: 'Start date must be after January 1, 0001.' });
  if (filter.end_date === '9999-12-31') ctx.addIssue({ code: 'custom', message: 'End date must be before December 31, 9999.' });
});

export type ReportingFilter = z.infer<typeof reportingFilterSchema>;

export const analyticsDashboardSchema = z.object({
  summary: financeSummarySchema,
  store_timezone: z.string().min(1),
  as_of_date: date,
  selected_preset: z.enum(['demo', 'custom', 'last_7_days', 'last_30_days', 'last_90_days']),
  daily: z.array(z.object({
    date,
    revenue: financialAmount,
    order_count: count,
    visitors: count.nullable(),
    conversion_rate: financialCost,
    operating_expenses: money,
    advertising_expenditure: money,
    total_expenses: money,
    gross_profit: financialAmount,
    operating_profit: financialAmount,
    data_completeness: dataCompletenessSchema,
  })).max(366),
  products: z.array(z.object({
    product_id: z.uuid(),
    name: z.string().min(1),
    sku: z.string().min(1),
    units_sold: count,
    units_returned: count,
    revenue: financialAmount,
    cogs: financialAmount,
    gross_profit: financialAmount,
    gross_profit_margin: financialAmount,
    data_completeness: dataCompletenessSchema,
  })),
  expenses: z.array(z.object({
    category: z.enum(['employee_costs', 'rent', 'shipping', 'platform_fees', 'other_operating', 'advertising']),
    label: z.string().min(1),
    amount: money,
  })),
  unallocated_customer_shipping_revenue: financialAmount,
  product_warnings: z.array(z.string().min(1)),
}).superRefine((data, ctx) => {
  // Check calendar alignment, never recalculate the server's financial metrics.
  const { start, end } = data.summary.reporting_period;
  const expectedDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
  if (data.daily.length !== expectedDays) ctx.addIssue({ code: 'custom', message: 'Analytics dates do not cover the reporting period.' });
  for (let index = 0; index < data.daily.length; index += 1) {
    const expected = new Date(Date.parse(`${start}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10);
    if (data.daily[index].date !== expected) ctx.addIssue({ code: 'custom', message: 'Analytics dates must be in reporting order.' });
  }
});

export type AnalyticsDashboard = z.infer<typeof analyticsDashboardSchema>;
