import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { FinanceSummary } from '../api/schemas';
import type { SimulationResponse } from '../api/simulation';
import { simulationFixture } from '../test/simulation-fixture';
import { useSimulation } from './use-simulation';

afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('simulation request lifecycle', () => {
  it('loads the database-defined period and replaces the baseline with the preview transaction', async () => {
    const fixture = simulationFixture();
    vi.spyOn(api, 'financeBaseline').mockResolvedValue(fixture.baseline);
    const newest = { ...fixture, baseline: { ...fixture.baseline, revenue: '101.00' } };
    const preview = vi.spyOn(api, 'simulationPreview').mockResolvedValue(newest);
    const { result } = renderHook(() => useSimulation());
    await waitFor(() => expect(result.current.baseline.status).toBe('success'));
    await act(async () => result.current.run(fixture.parameters));
    expect(preview).toHaveBeenCalledWith({ start_date: '2026-09-01', end_date: '2026-09-01', parameters: fixture.parameters }, expect.any(AbortSignal));
    expect(result.current.baseline).toEqual({ status: 'success', data: newest.baseline });
    expect(result.current.preview).toEqual({ status: 'success', data: newest });
  });

  it('aborts and ignores a late scenario response when the reporting period changes', async () => {
    const fixture = simulationFixture();
    const nextBaseline = { ...fixture.baseline, reporting_period: { start: '2026-09-02', end: '2026-09-02' } };
    vi.spyOn(api, 'financeBaseline').mockResolvedValueOnce(fixture.baseline).mockResolvedValue(nextBaseline);
    const pending = deferred<SimulationResponse>();
    const preview = vi.spyOn(api, 'simulationPreview').mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSimulation());
    await waitFor(() => expect(result.current.baseline.status).toBe('success'));
    act(() => { void result.current.run(fixture.parameters); });
    const signal = preview.mock.calls[0][1];
    act(() => result.current.loadBaseline({ start_date: '2026-09-02', end_date: '2026-09-02' }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.baseline).toEqual({ status: 'success', data: nextBaseline }));
    await act(async () => pending.resolve(fixture));
    expect(result.current.preview).toEqual({ status: 'idle' });
    expect(result.current.baseline).toEqual({ status: 'success', data: nextBaseline });
  });

  it('clears edited scenarios, ignores stale failures and aborts in-flight requests on navigation', async () => {
    const fixture = simulationFixture();
    vi.spyOn(api, 'financeBaseline').mockResolvedValue(fixture.baseline);
    const old = deferred<SimulationResponse>();
    const next = deferred<SimulationResponse>();
    const preview = vi.spyOn(api, 'simulationPreview').mockReturnValueOnce(old.promise).mockReturnValue(next.promise);
    const { result, unmount } = renderHook(() => useSimulation());
    await waitFor(() => expect(result.current.baseline.status).toBe('success'));
    act(() => { void result.current.run(fixture.parameters); });
    act(() => result.current.invalidatePreview());
    expect(preview.mock.calls[0][1]?.aborted).toBe(true);
    act(() => { void result.current.run({ ...fixture.parameters, discount_pct: '10' }); });
    await act(async () => old.reject(new Error('Stale error')));
    expect(result.current.preview.status).toBe('loading');
    unmount();
    expect(preview.mock.calls[1][1]?.aborted).toBe(true);
    await act(async () => next.resolve(fixture));
  });

  it('retries failed baselines with the chosen period and ignores earlier baseline responses', async () => {
    const fixture = simulationFixture();
    const old = deferred<FinanceSummary>();
    const fetch = vi.spyOn(api, 'financeBaseline').mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(fixture.baseline);
    const { result } = renderHook(() => useSimulation());
    const period = { start_date: '2026-09-01', end_date: '2026-09-01' };
    act(() => result.current.loadBaseline(period));
    expect(fetch.mock.calls[0][1]?.aborted).toBe(true);
    await waitFor(() => expect(result.current.baseline.status).toBe('error'));
    act(() => result.current.retryBaseline());
    await waitFor(() => expect(result.current.baseline.status).toBe('success'));
    expect(fetch).toHaveBeenLastCalledWith(period, expect.any(AbortSignal));
    await act(async () => old.resolve({ ...fixture.baseline, revenue: '999.00' }));
    expect(result.current.baseline).toEqual({ status: 'success', data: fixture.baseline });
  });
});
