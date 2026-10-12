import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantRequestSchema, assistantResponseSchema } from './assistant';
import { api } from './client';
import { optimizationFixture } from '../test/optimization-fixture';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('assistant API contract', () => {
  it('sends a validated complete merchant goal and selected period without tenant controls', async () => {
    const optimization = optimizationFixture();
    const response = { message: 'Calculated strategies are hypothetical.', metrics: optimization.baseline, optimization, tools_used: ['get_store_metrics', 'run_goal_optimization'] };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 })); vi.stubGlobal('fetch', fetch);
    const request = { message: '  Increase profit by 20% without increasing ads.  ', start_date: optimization.reporting_period.start, end_date: optimization.reporting_period.end };
    expect(await api.assistantChat(request)).toEqual(response);
    expect(fetch.mock.calls[0][0].pathname).toBe('/api/assistant/chat');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ...request, message: request.message.trim() });
    for (const bad of [{ ...request, message: ' ' }, { ...request, message: 'a'.repeat(2001) }, { ...request, store_id: 'other' }, { ...request, end_date: '2025-01-01' }]) expect(assistantRequestSchema.safeParse(bad).success).toBe(false);
  });
  it('requires verified result provenance and consistent metadata', () => {
    const optimization = optimizationFixture();
    const response = { message: 'Result.', metrics: optimization.baseline, optimization, tools_used: ['get_store_metrics', 'run_goal_optimization'] };
    expect(assistantResponseSchema.safeParse(response).success).toBe(true);
    expect(assistantResponseSchema.safeParse({ ...response, tools_used: ['arbitrary_sql'] }).success).toBe(false);
    expect(assistantResponseSchema.safeParse({ ...response, tools_used: ['get_store_metrics'] }).success).toBe(false);
    expect(assistantResponseSchema.safeParse({ ...response, tools_used: ['get_store_metrics', 'get_store_metrics'] }).success).toBe(false);
    expect(assistantResponseSchema.safeParse({ ...response, metrics: { ...optimization.baseline, currency: 'EUR' } }).success).toBe(false);
    expect(assistantResponseSchema.parse({ message: 'Please give a percentage target.', metrics: null, optimization: null, tools_used: [] }).optimization).toBeNull();
  });
  it('displays the sanitized missing-credentials error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'AI assistant is not configured. Use Goal Optimizer directly.' }), { status: 503 })));
    await expect(api.assistantChat({ message: 'Increase profit by 20%.', start_date: '2026-09-01', end_date: '2026-09-30' })).rejects.toThrow('AI assistant is not configured.');
  });
  it('allows a bounded 55-second assistant request without changing ordinary API timeouts', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
    const request = api.assistantChat({ message: 'Increase profit by 20%.', start_date: '2026-09-01', end_date: '2026-09-30' });
    const rejected = expect(request).rejects.toThrow('The API took too long');
    await vi.advanceTimersByTimeAsync(8001);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(47000); await rejected;
    const ordinary = api.health(); const ordinaryRejected = expect(ordinary).rejects.toThrow('The API took too long');
    await vi.advanceTimersByTimeAsync(8000); await ordinaryRejected;
  });
});
