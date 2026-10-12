import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { financeSummarySchema } from './schemas';

const summary = {
  revenue: '100.00',
  cogs: '60.00',
  gross_profit: '40.00',
  operating_expenses: '100.00',
  advertising_expenditure: '20.00',
  total_expenses: '120.00',
  operating_profit: '-80.00',
  gross_profit_margin: '40.00',
  contribution_margin: '20.00',
  operating_profit_margin: '-80.00',
  average_order_value: '25.00',
  order_count: 4,
  visitors: 100,
  conversion_rate: '4.00',
  currency: 'EUR',
  reporting_period: { start: '2026-09-01', end: '2026-09-30' },
  data_source: { type: 'database_demo', description: 'Synthetic transactions stored in PostgreSQL.' },
  data_completeness: {
    is_complete: true,
    warnings: [],
    missing_vat_lines: 0,
    missing_refund_orders: 0,
    missing_shipping_orders: 0,
    missing_restock_refunds: 0,
    missing_order_items: 0,
    traffic_days: 30,
    expected_traffic_days: 30,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('financial summary contract', () => {
  it('preserves exact decimal strings and negative profits and margins', () => {
    const result = financeSummarySchema.parse(summary);
    expect(result.revenue).toBe('100.00');
    expect(result.operating_profit).toBe('-80.00');
    expect(result.operating_profit_margin).toBe('-80.00');
    expect(financeSummarySchema.safeParse({ ...summary, gross_profit: '-40.00', gross_profit_margin: '-400.00' }).success).toBe(true);
  });

  it('accepts negative revenue and COGS for a refund-only reporting period', () => {
    const result = financeSummarySchema.parse({ ...summary, revenue: '-120.00', cogs: '-60.00', order_count: 0 });
    expect(result.revenue).toBe('-120.00');
    expect(result.cogs).toBe('-60.00');
  });

  it('keeps incomplete and undefined metrics null instead of treating them as zero', () => {
    const result = financeSummarySchema.parse({
      ...summary,
      revenue: null,
      gross_profit: null,
      operating_profit: null,
      gross_profit_margin: null,
      contribution_margin: null,
      operating_profit_margin: null,
      average_order_value: null,
      conversion_rate: null,
      data_completeness: { ...summary.data_completeness, is_complete: false, missing_vat_lines: 1, traffic_days: 29, warnings: ['A transaction has unknown VAT semantics.', 'Traffic is incomplete.'] },
    });
    expect(result.revenue).toBeNull();
    expect(result.operating_profit_margin).toBeNull();
    expect(result.conversion_rate).toBeNull();
    expect(result.data_completeness.is_complete).toBe(false);
    expect(result.data_completeness.warnings).toHaveLength(2);
  });

  it('accepts zero activity with undefined margins and average order value', () => {
    expect(financeSummarySchema.safeParse({
      ...summary, revenue: '0.00', cogs: '0.00', gross_profit: '0.00',
      operating_expenses: '0.00', advertising_expenditure: '0.00', total_expenses: '0.00',
      operating_profit: '0.00', gross_profit_margin: null, contribution_margin: null,
      operating_profit_margin: null, average_order_value: null, order_count: 0,
      visitors: 0, conversion_rate: null,
    }).success).toBe(true);
  });

  it('rejects malformed financial amounts and negative expenses', () => {
    for (const value of [100, '', 'NaN', 'Infinity', '100.001', '1e2', 'unknown']) {
      expect(financeSummarySchema.safeParse({ ...summary, revenue: value }).success).toBe(false);
    }
    expect(financeSummarySchema.safeParse({ ...summary, advertising_expenditure: '-1.00' }).success).toBe(false);
    expect(financeSummarySchema.safeParse({ ...summary, operating_expenses: '-1.00' }).success).toBe(false);
  });

  it('rejects missing completeness metadata and invalid dates or counts', () => {
    expect(financeSummarySchema.safeParse({ ...summary, data_completeness: undefined }).success).toBe(false);
    expect(financeSummarySchema.safeParse({ ...summary, data_completeness: { ...summary.data_completeness, missing_vat_lines: -1 } }).success).toBe(false);
    expect(financeSummarySchema.safeParse({ ...summary, order_count: 0.5 }).success).toBe(false);
    expect(financeSummarySchema.safeParse({ ...summary, visitors: -1 }).success).toBe(false);
    expect(financeSummarySchema.safeParse({ ...summary, visitors: null }).success).toBe(false);
    expect(financeSummarySchema.safeParse({ ...summary, reporting_period: { start: '2026-09-30', end: '2026-09-01' } }).success).toBe(false);
  });

  it('requests the dedicated finance endpoint through the shared API client', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(summary)));
    vi.stubGlobal('fetch', fetch);
    const result = await api.financeSummary();
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe('/api/finance/summary');
    expect(result.operating_profit).toBe('-80.00');
  });
});
