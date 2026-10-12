import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsPath, api } from './client';
import { analyticsDashboardSchema, reportingFilterSchema } from './schemas';
import { analyticsFixture } from '../test/analytics-fixture';
import { chartNumber } from '../components/analytics';

afterEach(() => vi.unstubAllGlobals());

describe('analytics contracts and reporting filters', () => {
  it('uses one atomic analytics endpoint and keeps the sample period explicit', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(analyticsFixture())));
    vi.stubGlobal('fetch', fetch);
    const result = await api.analyticsDashboard({ preset: 'demo' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe('/api/analytics/dashboard');
    expect(new URL(String(fetch.mock.calls[0][0])).search).toBe('');
    expect(result.summary.operating_profit).toBe('-20.00');
    expect(result.products[0].revenue).toBe('100.00');
  });

  it.each(['last_7_days', 'last_30_days', 'last_90_days'] as const)('sends %s for the server to resolve in store time', (preset) => {
    expect(analyticsPath({ preset })).toBe(`/api/analytics/dashboard?preset=${preset}`);
  });

  it('sends paired inclusive custom dates without a competing preset', () => {
    expect(analyticsPath({ preset: 'custom', start_date: '2026-09-01', end_date: '2026-09-03' })).toBe('/api/analytics/dashboard?start_date=2026-09-01&end_date=2026-09-03');
  });

  it('rejects invalid, reversed, missing and overlong custom dates', () => {
    for (const input of [
      { preset: 'custom', start_date: '2026-09-02', end_date: '2026-09-01' },
      { preset: 'custom', start_date: '2026-02-30', end_date: '2026-03-01' },
      { preset: 'custom', start_date: '2026-01-01' },
      { preset: 'custom', start_date: '2024-01-01', end_date: '2025-01-01' },
      { preset: 'custom', start_date: '0001-01-01', end_date: '0001-01-02' },
      { preset: 'custom', start_date: '9999-12-30', end_date: '9999-12-31' },
      { preset: 'last_7_days', start_date: '2026-09-01' },
    ]) expect(reportingFilterSchema.safeParse(input).success).toBe(false);
    expect(reportingFilterSchema.safeParse({ preset: 'custom', start_date: '2024-01-01', end_date: '2024-12-31' }).success).toBe(true);
    expect(reportingFilterSchema.safeParse({ preset: 'custom', start_date: '2026-09-01', end_date: '2026-09-01' }).success).toBe(true);
  });

  it('preserves chart gaps for missing values and accepts refund-only product losses', () => {
    const response = analyticsFixture();
    response.daily[0].visitors = null;
    response.daily[0].conversion_rate = null;
    response.daily[0].revenue = null;
    response.products[0].revenue = '-20.00';
    response.products[0].cogs = '-10.00';
    response.products[0].gross_profit = '-10.00';
    response.products[0].gross_profit_margin = null;
    const parsed = analyticsDashboardSchema.parse(response);
    expect(parsed.daily[0].visitors).toBeNull();
    expect(chartNumber(parsed.daily[0].revenue)).toBeNull();
    expect(chartNumber('0.00')).toBe(0);
    expect(parsed.products[0].gross_profit).toBe('-10.00');
  });

  it('rejects missing, duplicate and out-of-period daily dates', () => {
    const response = analyticsFixture();
    expect(analyticsDashboardSchema.safeParse({ ...response, daily: [] }).success).toBe(false);
    expect(analyticsDashboardSchema.safeParse({ ...response, daily: [response.daily[0], response.daily[0]] }).success).toBe(false);
    expect(analyticsDashboardSchema.safeParse({ ...response, daily: [{ ...response.daily[0], date: '2026-09-02' }] }).success).toBe(false);
  });

  it('rejects numeric money, negative costs and malformed product identities', () => {
    const response = analyticsFixture();
    expect(analyticsDashboardSchema.safeParse({ ...response, expenses: [{ ...response.expenses[0], amount: -1 }] }).success).toBe(false);
    expect(analyticsDashboardSchema.safeParse({ ...response, expenses: [{ ...response.expenses[0], amount: '-1.00' }] }).success).toBe(false);
    expect(analyticsDashboardSchema.safeParse({ ...response, products: [{ ...response.products[0], product_id: 'bad-id' }] }).success).toBe(false);
  });
});
