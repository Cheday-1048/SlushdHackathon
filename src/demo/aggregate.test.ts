import { describe, expect, it } from 'vitest';
import { analyticsDashboardSchema, reportingFilterSchema, type AnalyticsDashboard, type ReportingFilter } from '../api/schemas';
import { business, buildDemoDashboard, resolvePeriod } from './aggregate';
import references from './reference-ranges.fixture.json';

/*
 * reference-ranges.fixture.json holds real responses of the backend's analytics service (backend/app/services/analytics.py)
 * for the same seeded store, produced for several periods. The demo adapter must reproduce them exactly.
 */
const cents = (value: string | null) => BigInt((value ?? '0').replace('.', ''));
const withoutSource = (dashboard: AnalyticsDashboard) => ({ ...dashboard, summary: { ...dashboard.summary, data_source: undefined } });
const filterOf = (query: Record<string, string>): ReportingFilter => reportingFilterSchema.parse(
  query.preset ? { preset: query.preset } : query.start_date ? { preset: 'custom', start_date: query.start_date, end_date: query.end_date } : { preset: 'demo' });

describe('demo adapter versus real backend responses', () => {
  for (const reference of references) {
    it(`reproduces the backend result for "${reference.name}"`, () => {
      const expected = analyticsDashboardSchema.parse(reference.response);
      const actual = buildDemoDashboard(filterOf(reference.query as Record<string, string>));
      expect(withoutSource(actual)).toEqual(withoutSource(expected));
    });
  }

  it('matches the documented September 2026 financial results', () => {
    const { summary } = buildDemoDashboard({ preset: 'demo' });
    expect(summary).toMatchObject({
      revenue: '29371.63', cogs: '10906.00', gross_profit: '18465.63', operating_expenses: '6507.45', advertising_expenditure: '1776.00',
      total_expenses: '8283.45', operating_profit: '10182.18', operating_profit_margin: '34.67', order_count: 342, visitors: 11635, conversion_rate: '2.94',
    });
  });
});

describe('demo dataset consistency', () => {
  const filters: ReportingFilter[] = [
    { preset: 'demo' }, { preset: 'last_7_days' }, { preset: 'last_90_days' },
    { preset: 'custom', start_date: '2026-09-10', end_date: '2026-09-16' }, { preset: 'custom', start_date: '2026-08-20', end_date: '2026-10-05' },
  ];
  for (const filter of filters) {
    it(`keeps summary, daily series, products and expenses consistent for ${JSON.stringify(filter)}`, () => {
      const { summary, daily, products, expenses } = buildDemoDashboard(filter);
      const sum = (values: (string | null)[]) => values.reduce((total, value) => total + cents(value), 0n);
      expect(sum(daily.map((day) => day.revenue))).toBe(cents(summary.revenue));
      expect(sum(products.map((product) => product.revenue))).toBe(cents(summary.revenue));
      expect(sum(products.map((product) => product.cogs))).toBe(cents(summary.cogs));
      expect(sum(daily.map((day) => day.operating_profit))).toBe(cents(summary.operating_profit));
      expect(daily.reduce((total, day) => total + day.order_count, 0)).toBe(summary.order_count);
      expect(sum(expenses.map((expense) => expense.amount))).toBe(cents(summary.total_expenses));
      expect(cents(summary.revenue) - cents(summary.cogs)).toBe(cents(summary.gross_profit));
      expect(cents(summary.gross_profit) - cents(summary.total_expenses)).toBe(cents(summary.operating_profit));
      expect(cents(summary.operating_expenses) + cents(summary.advertising_expenditure)).toBe(cents(summary.total_expenses));
    });
  }

  it('describes one business with twelve products and a plausible order count', () => {
    expect(business).toMatchObject({ name: 'Nova Commerce', currency: 'USD', period: { start: '2026-09-01', end: '2026-09-30' } });
    const { products, summary } = buildDemoDashboard({ preset: 'demo' });
    expect(products).toHaveLength(12);
    expect(summary.order_count).toBeGreaterThanOrEqual(300);
    expect(summary.order_count).toBeLessThanOrEqual(400);
  });
});

describe('demo period filters', () => {
  it('anchors presets on the dataset end and returns the requested number of days', () => {
    expect(resolvePeriod({ preset: 'last_7_days' })).toEqual({ start: '2026-09-24', end: '2026-09-30' });
    expect(resolvePeriod({ preset: 'last_30_days' })).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    for (const days of [7, 30, 90]) expect(buildDemoDashboard({ preset: `last_${days}_days` as 'last_7_days' }).daily).toHaveLength(days);
  });

  it('gives different results for different periods', () => {
    const week = buildDemoDashboard({ preset: 'custom', start_date: '2026-09-08', end_date: '2026-09-14' }).summary;
    const nextWeek = buildDemoDashboard({ preset: 'custom', start_date: '2026-09-15', end_date: '2026-09-21' }).summary;
    expect(week.revenue).not.toBe(nextWeek.revenue);
    expect(Number(nextWeek.operating_profit_margin)).toBeLessThan(Number(week.operating_profit_margin));
  });

  it('shows zero amounts and unavailable ratios when a period has no data', () => {
    const empty = buildDemoDashboard({ preset: 'custom', start_date: '2027-01-01', end_date: '2027-01-07' });
    expect(empty.summary).toMatchObject({ revenue: '0.00', order_count: 0, visitors: 0, operating_profit_margin: null, average_order_value: null, conversion_rate: null });
    expect(empty.products).toEqual([]);
    expect(empty.daily.every((day) => day.visitors === null && day.conversion_rate === null)).toBe(true);
  });

  it('flags partial coverage instead of inventing conversion', () => {
    const partial = buildDemoDashboard({ preset: 'last_90_days' }).summary;
    expect(partial.conversion_rate).toBeNull();
    expect(partial.data_completeness).toMatchObject({ is_complete: false, traffic_days: 30, expected_traffic_days: 90 });
  });

  it('rejects periods the real API would also reject', () => {
    expect(() => reportingFilterSchema.parse({ preset: 'custom', start_date: '2026-01-01', end_date: '2027-12-31' })).toThrow();
  });
});
