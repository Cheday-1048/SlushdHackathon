import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { AnalyticsDashboard } from '../api/schemas';
import { analyticsFixture } from '../test/analytics-fixture';
import { useDashboard } from './use-dashboard';

afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('dashboard request lifecycle', () => {
  it('starts loading, reports errors and retries the current filter', async () => {
    vi.spyOn(api, 'health').mockResolvedValue({ status: 'ok', service: 'retail-test' });
    const request = deferred<AnalyticsDashboard>();
    const fetch = vi.spyOn(api, 'analyticsDashboard').mockReturnValueOnce(request.promise).mockResolvedValue(analyticsFixture());
    const { result } = renderHook(() => useDashboard());
    expect(result.current.dashboard.status).toBe('loading');
    await act(async () => request.reject(new Error('Database unavailable')));
    expect(result.current.dashboard).toEqual({ status: 'error', message: 'Database unavailable' });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.dashboard.status).toBe('success'));
    expect(fetch).toHaveBeenLastCalledWith({ preset: 'demo' }, expect.any(AbortSignal));
  });

  it('aborts stale requests and ignores late success responses after a filter change', async () => {
    vi.spyOn(api, 'health').mockResolvedValue({ status: 'ok', service: 'retail-test' });
    const oldRequest = deferred<AnalyticsDashboard>();
    const newRequest = deferred<AnalyticsDashboard>();
    const fetch = vi.spyOn(api, 'analyticsDashboard').mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const { result } = renderHook(() => useDashboard());
    const oldSignal = fetch.mock.calls[0][1];
    act(() => result.current.setFilter({ preset: 'last_7_days' }));
    expect(oldSignal?.aborted).toBe(true);
    expect(result.current.dashboard.status).toBe('loading');
    const newest = { ...analyticsFixture(), selected_preset: 'last_7_days' as const };
    await act(async () => newRequest.resolve(newest));
    await act(async () => oldRequest.resolve(analyticsFixture()));
    expect(result.current.dashboard).toEqual({ status: 'success', data: newest });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('ignores a late error after the latest request succeeds', async () => {
    vi.spyOn(api, 'health').mockResolvedValue({ status: 'ok', service: 'retail-test' });
    const oldRequest = deferred<AnalyticsDashboard>();
    vi.spyOn(api, 'analyticsDashboard').mockReturnValueOnce(oldRequest.promise).mockResolvedValue(analyticsFixture());
    const { result, unmount } = renderHook(() => useDashboard());
    act(() => result.current.setFilter({ preset: 'custom', start_date: '2026-09-01', end_date: '2026-09-01' }));
    await waitFor(() => expect(result.current.dashboard.status).toBe('success'));
    await act(async () => oldRequest.reject(new Error('Late network error')));
    expect(result.current.dashboard.status).toBe('success');
    unmount();
  });
});
