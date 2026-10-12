import { describe, expect, it } from 'vitest';
import { dashboardSummarySchema } from './schemas';

const summary = {
  revenue: '1234.56',
  total_orders: 51,
  total_visitors: 4000,
  conversion_rate: '1.28',
  total_expenses: '180.30',
  operating_expenses: '100.10',
  advertising_expenditure: '80.20',
  currency: 'EUR',
  reporting_period: { start: '2026-09-01', end: '2026-09-30' },
  data_source: { type: 'database_demo', description: 'Synthetic sample data stored in PostgreSQL.' },
};

describe('database dashboard contract', () => {
  it('accepts Decimal strings and rounds conversion ties like the backend', () => {
    const result = dashboardSummarySchema.parse(summary);
    expect(result.revenue).toBe(1234.56);
    expect(result.conversion_rate).toBe(1.28);
    expect(result.operating_expenses).toBe(100.10);
    expect(result.advertising_expenditure).toBe(80.20);
  });

  it('rejects inconsistent conversion metrics', () => {
    expect(dashboardSummarySchema.safeParse({ ...summary, conversion_rate: '1.27' }).success).toBe(false);
    expect(dashboardSummarySchema.safeParse({ ...summary, total_orders: 4001, conversion_rate: '100.00' }).success).toBe(false);
  });

  it('rejects double-counted advertising in total expenses', () => {
    expect(dashboardSummarySchema.safeParse({ ...summary, total_expenses: '260.50' }).success).toBe(false);
  });

  it('validates large expense sums without floating-point addition errors', () => {
    expect(dashboardSummarySchema.safeParse({ ...summary, operating_expenses: '99999999999.10', advertising_expenditure: '0.20', total_expenses: '99999999999.30' }).success).toBe(true);
  });

  it('accepts an empty reporting period with zero metrics', () => {
    const result = dashboardSummarySchema.safeParse({
      ...summary, revenue: '0.00', total_orders: 0, total_visitors: 0,
      conversion_rate: '0.00', total_expenses: '0.00', operating_expenses: '0.00', advertising_expenditure: '0.00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects old mock responses and missing expense components', () => {
    expect(dashboardSummarySchema.safeParse({ ...summary, data_source: { ...summary.data_source, type: 'mock' } }).success).toBe(false);
    expect(dashboardSummarySchema.safeParse({ ...summary, operating_expenses: undefined }).success).toBe(false);
  });

  it('rejects malformed money and reversed reporting dates', () => {
    expect(dashboardSummarySchema.safeParse({ ...summary, revenue: 1234.56 }).success).toBe(false);
    expect(dashboardSummarySchema.safeParse({ ...summary, revenue: '1234.567' }).success).toBe(false);
    expect(dashboardSummarySchema.safeParse({ ...summary, operating_expenses: 'invalid' }).success).toBe(false);
    expect(dashboardSummarySchema.safeParse({ ...summary, conversion_rate: 'invalid' }).success).toBe(false);
    expect(dashboardSummarySchema.safeParse({ ...summary, total_visitors: 4000.5 }).success).toBe(false);
    expect(dashboardSummarySchema.safeParse({ ...summary, reporting_period: { start: '2026-09-30', end: '2026-09-01' } }).success).toBe(false);
  });
});
