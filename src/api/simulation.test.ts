import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulationFixture } from '../test/simulation-fixture';
import { api } from './client';
import { defaultSimulationValues, simulationFormSchema, simulationPeriodSchema, simulationResponseSchema } from './simulation';

afterEach(() => vi.unstubAllGlobals());

describe('simulation validation and API contract', () => {
  it('keeps exact decimal inputs as strings and blank conversion as an exact-ratio instruction', () => {
    const parsed = simulationFormSchema.parse({ ...defaultSimulationValues, discount_pct: '10.1234', advertising_budget_change_amount: '-12.34' });
    expect(parsed.discount_pct).toBe('10.1234');
    expect(parsed.advertising_budget_change_amount).toBe('-12.34');
    expect(parsed.expected_conversion_rate).toBeNull();
    expect(simulationFormSchema.parse({ ...defaultSimulationValues, expected_conversion_rate: '0' }).expected_conversion_rate).toBe('0');
  });

  it('rejects invalid scenario bounds, nonfinite values, exponents and excessive precision', () => {
    for (const [key, value] of [
      ['selling_price_change_pct', '-100.01'], ['selling_price_change_pct', '1000.0001'],
      ['discount_pct', '100.0001'], ['discount_pct', '-1'], ['expected_conversion_rate', '101'],
      ['visitor_change_pct', '-101'], ['visitor_change_pct', '10001'], ['unit_cost_change_pct', '-101'],
      ['additional_operating_expense_amount', '-0.01'], ['advertising_budget_change_amount', '1.001'],
      ['selling_price_change_pct', 'NaN'], ['expected_conversion_rate', 'Infinity'],
      ['visitor_change_pct', '1e3'], ['discount_pct', '1.00001'], ['unit_cost_change_pct', ''],
      ['additional_operating_expense_amount', '100000000000000.00'],
    ]) expect(simulationFormSchema.safeParse({ ...defaultSimulationValues, [key]: value }).success, `${key}=${value}`).toBe(false);
    expect(simulationFormSchema.safeParse({ ...defaultSimulationValues, selling_price_change_pct: 10 }).success).toBe(false);
    expect(simulationFormSchema.safeParse({ ...defaultSimulationValues, advertising_budget_change_amount: '-99999999999999.99' }).success).toBe(true);
    expect(simulationFormSchema.safeParse({ ...defaultSimulationValues, additional_operating_expense_amount: '99999999999999.99' }).success).toBe(true);
  });

  it('requires reproducible dates and bounds inclusive periods to 366 days', () => {
    expect(simulationPeriodSchema.safeParse({ start_date: '2026-01-01', end_date: '2027-01-01' }).success).toBe(true);
    for (const period of [
      { start_date: '2026-01-01', end_date: '2027-01-02' },
      { start_date: '2026-09-30', end_date: '2026-09-01' },
      { start_date: '2026-02-30', end_date: '2026-03-01' },
      { start_date: '', end_date: '2026-03-01' },
    ]) expect(simulationPeriodSchema.safeParse(period).success).toBe(false);
  });

  it('preserves signed results, fractional expected orders and undefined profit changes', () => {
    const result = simulationFixture();
    if (result.status !== 'ready') throw new Error('Fixture must be ready');
    const parsed = simulationResponseSchema.parse({ ...result, simulated: { ...result.simulated, expected_orders: '4.123456' } });
    expect(parsed.simulated?.operating_profit).toBe('-20.00');
    expect(parsed.simulated?.expected_orders).toBe('4.123456');
    expect(parsed.differences?.profit_change_pct).toBeNull();
    expect(simulationResponseSchema.safeParse({ ...result, simulated: { ...result.simulated, expected_orders: '-1.000000' } }).success).toBe(false);
    expect(simulationResponseSchema.safeParse({ ...result, simulated: { ...result.simulated, expected_orders: 4 } }).success).toBe(false);
  });

  it('rejects results whose period, currency or availability status disagree with the baseline', () => {
    const result = simulationFixture();
    expect(simulationResponseSchema.safeParse({ ...result, currency: 'EUR' }).success).toBe(false);
    expect(simulationResponseSchema.safeParse({ ...result, reporting_period: { start: '2026-09-02', end: '2026-09-02' } }).success).toBe(false);
    expect(simulationResponseSchema.safeParse({ ...result, status: 'unavailable' }).success).toBe(false);
    expect(simulationResponseSchema.safeParse({ ...result, baseline: { ...result.baseline, revenue: null } }).success).toBe(false);
    const unavailable = simulationResponseSchema.parse({ ...result, status: 'unavailable', simulated: null, differences: null });
    expect(unavailable.simulated).toBeNull();
  });

  it('posts validated decimal strings as JSON without modifying the historical GET API', async () => {
    const result = simulationFixture();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    vi.stubGlobal('fetch', fetch);
    const scenario = { start_date: '2026-09-01', end_date: '2026-09-01', parameters: result.parameters };
    expect(await api.simulationPreview(scenario)).toEqual(result);
    expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe('/api/simulations/preview');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(scenario);
    fetch.mockResolvedValue(new Response(JSON.stringify(result.baseline)));
    await api.financeBaseline({ start_date: '2026-09-01', end_date: '2026-09-01' });
    expect(new URL(String(fetch.mock.calls[1][0])).search).toBe('?start_date=2026-09-01&end_date=2026-09-01');
    expect(fetch.mock.calls[1][1].method).toBeUndefined();
  });

  it('surfaces server validation reasons such as a negative resulting advertising budget', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ loc: ['body', 'parameters'], msg: 'Advertising budget must not become negative.', type: 'value_error' }] }), { status: 422 })));
    const result = simulationFixture();
    await expect(api.simulationPreview({ start_date: '2026-09-01', end_date: '2026-09-01', parameters: result.parameters })).rejects.toThrow('Advertising budget must not become negative.');
  });
});
