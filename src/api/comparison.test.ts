import { afterEach, describe, expect, it, vi } from 'vitest';
import { comparisonFixture } from '../test/comparison-fixture';
import { api } from './client';
import { comparisonRequestSchema, comparisonResponseSchema } from './comparison';

function requestFixture() {
  const response = comparisonFixture();
  return { start_date: response.reporting_period.start, end_date: response.reporting_period.end, scenarios: response.scenarios.map(({ id, name, parameters }) => ({ id, name, parameters })) };
}
afterEach(() => vi.unstubAllGlobals());
describe('comparison contracts', () => {
  it('sends named scenarios as decimal strings and preserves losses and undefined changes', async () => {
    const response = comparisonFixture();
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal('fetch', fetch);
    const result = await api.simulationCompare(requestFixture());
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url.pathname).toBe('/api/simulations/compare');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual(requestFixture());
    expect(result.scenarios[0].simulated?.operating_profit).toBe('-20.00');
    expect(result.scenarios[0].differences?.profit_change_pct).toBeNull();
  });
  it('validates 2–4 unique identifiers, trimmed names, input limits and required dates', () => {
    const request = requestFixture();
    expect(comparisonRequestSchema.safeParse({ ...request, scenarios: request.scenarios.slice(0, 1) }).success).toBe(false);
    expect(comparisonRequestSchema.safeParse({ ...request, scenarios: Array(5).fill(request.scenarios[0]) }).success).toBe(false);
    expect(comparisonRequestSchema.safeParse({ ...request, scenarios: [request.scenarios[0], request.scenarios[0]] }).success).toBe(false);
    expect(comparisonRequestSchema.parse({ ...request, scenarios: [{ ...request.scenarios[0], name: '  Strategy  ' }, request.scenarios[1]] }).scenarios[0].name).toBe('Strategy');
    expect(comparisonRequestSchema.safeParse({ ...request, scenarios: [{ ...request.scenarios[0], name: '   ' }, request.scenarios[1]] }).success).toBe(false);
    expect(comparisonRequestSchema.safeParse({ ...request, scenarios: [{ ...request.scenarios[0], parameters: { ...request.scenarios[0].parameters, discount_pct: '101' } }, request.scenarios[1]] }).success).toBe(false);
    expect(comparisonRequestSchema.safeParse({ ...request, end_date: '2025-01-01' }).success).toBe(false);
  });
  it('rejects mismatched baseline metadata and duplicate response identifiers', () => {
    const response = comparisonFixture();
    expect(comparisonResponseSchema.safeParse(response).success).toBe(true);
    expect(comparisonResponseSchema.safeParse({ ...response, currency: 'EUR' }).success).toBe(false);
    expect(comparisonResponseSchema.safeParse({ ...response, scenarios: [response.scenarios[0], response.scenarios[0]] }).success).toBe(false);
    expect(comparisonResponseSchema.safeParse({ ...response, snapshot_id: 'invented' }).success).toBe(false);
  });
  it('accepts explicitly unavailable results without manufacturing metrics', () => {
    const response = comparisonFixture();
    const result = comparisonResponseSchema.parse({ ...response, scenarios: response.scenarios.map((scenario) => ({ ...scenario, status: 'unavailable', simulated: null, differences: null, comparison: null, warnings: ['Missing financial data.'] })) });
    expect(result.scenarios[0].simulated).toBeNull();
  });
});
