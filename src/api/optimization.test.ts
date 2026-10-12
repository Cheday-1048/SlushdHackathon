import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { defaultOptimizationValues, optimizationFormSchema, optimizationRequestSchema, optimizationResponseSchema } from './optimization';
import { optimizationFixture } from '../test/optimization-fixture';
afterEach(() => vi.unstubAllGlobals());
describe('goal optimization contract', () => {
  it('sends strict decimal strings and bounded parameters over POST', async () => {
    const response = optimizationFixture();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 })); vi.stubGlobal('fetch', fetchMock);
    expect(await api.optimizeGoal(response.request)).toEqual(response);
    const [url, init] = fetchMock.mock.calls[0]; expect(url.pathname).toBe('/api/optimization/goal'); expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(response.request);
  });
  it('rejects contradictory constraints, missing explicit assumptions and unsafe limits', () => {
    const request = optimizationFixture().request;
    expect(optimizationRequestSchema.safeParse({ ...request, constraints: { ...request.constraints, min_selling_price_change_pct: '20' } }).success).toBe(false);
    expect(optimizationRequestSchema.safeParse({ ...request, behavioral_assumptions: { ...request.behavioral_assumptions, conversion_mode: 'explicit' } }).success).toBe(false);
    expect(optimizationRequestSchema.safeParse({ ...request, search: { ...request.search, price_points: 6 } }).success).toBe(false);
    expect(optimizationRequestSchema.safeParse({ ...request, store_id: 'other-store' }).success).toBe(false);
    expect(optimizationRequestSchema.safeParse({ ...request, target_profit_increase_pct: 10 }).success).toBe(false);
    expect(optimizationRequestSchema.safeParse({ ...request, constraints: { ...request.constraints, max_advertising_increase_amount: '100000000000000.00' } }).success).toBe(false);
    expect(optimizationFormSchema.safeParse({ ...defaultOptimizationValues, conversionMode: 'explicit' }).success).toBe(false);
  });
  it('rejects inconsistent feasibility and baseline metadata instead of inventing outcomes', () => {
    const response = optimizationFixture();
    expect(optimizationResponseSchema.safeParse({ ...response, status: 'target_not_achievable' }).success).toBe(false);
    expect(optimizationResponseSchema.safeParse({ ...response, feasible_candidate_count: 20 }).success).toBe(false);
    expect(optimizationResponseSchema.safeParse({ ...response, currency: 'EUR' }).success).toBe(false);
    expect(optimizationResponseSchema.safeParse({ ...response, target_operating_profit: null }).success).toBe(false);
    expect(optimizationResponseSchema.safeParse({ ...response, baseline: { ...response.baseline, operating_profit: '0.00' } }).success).toBe(false);
    expect(optimizationResponseSchema.safeParse({ ...response, rejections: { ...response.rejections, below_profit_target: 1 } }).success).toBe(false);
    expect(optimizationResponseSchema.parse({ ...response, status: 'unavailable', recommendations: [], candidates_evaluated: 0, feasible_candidate_count: 0, target_operating_profit: null, target_profit_difference: null, rejections: { below_profit_target: 0, below_minimum_margin: 0, unavailable: 0 } }).target_operating_profit).toBeNull();
  });
});
