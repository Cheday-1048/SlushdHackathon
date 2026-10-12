import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { ComparisonResponse } from '../api/comparison';
import { comparisonFixture } from '../test/comparison-fixture';
import { useComparison } from './use-comparison';

afterEach(() => vi.restoreAllMocks());
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function requestFixture() {
  const response = comparisonFixture();
  return { start_date: response.reporting_period.start, end_date: response.reporting_period.end, scenarios: response.scenarios.map(({ id, name, parameters }) => ({ id, name, parameters })) };
}
describe('comparison request lifecycle', () => {
  it('ignores a superseded response and retains the authoritative latest baseline', async () => {
    const old = deferred<ComparisonResponse>();
    const next = deferred<ComparisonResponse>();
    const compare = vi.spyOn(api, 'simulationCompare').mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useComparison());
    act(() => { void result.current.run(requestFixture(), onSuccess); });
    act(() => { void result.current.run(requestFixture(), onSuccess); });
    expect(compare.mock.calls[0][1]?.aborted).toBe(true);
    const latest = comparisonFixture();
    latest.baseline = { ...latest.baseline, revenue: '101.00' };
    await act(async () => next.resolve(latest));
    expect(result.current.state).toEqual({ status: 'success', data: latest });
    await act(async () => old.resolve(comparisonFixture()));
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(latest);
    expect(result.current.state).toEqual({ status: 'success', data: latest });
  });
  it('clears edited comparisons, ignores stale errors and aborts navigation', async () => {
    const old = deferred<ComparisonResponse>();
    const next = deferred<ComparisonResponse>();
    const compare = vi.spyOn(api, 'simulationCompare').mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const onSuccess = vi.fn();
    const { result, unmount } = renderHook(() => useComparison());
    act(() => { void result.current.run(requestFixture(), onSuccess); });
    act(() => result.current.invalidate());
    expect(compare.mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => old.reject(new Error('Stale error')));
    expect(result.current.state.status).toBe('idle');
    act(() => { void result.current.run(requestFixture(), onSuccess); });
    unmount();
    expect(compare.mock.calls[1][1]?.aborted).toBe(true);
    await act(async () => next.resolve(comparisonFixture()));
    expect(onSuccess).not.toHaveBeenCalled();
  });
  it('rejects a response associated with different scenario identifiers', async () => {
    const response = comparisonFixture();
    response.scenarios[0].id = '20000000-0000-4000-8000-000000000009';
    vi.spyOn(api, 'simulationCompare').mockResolvedValue(response);
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useComparison());
    await act(async () => result.current.run(requestFixture(), onSuccess));
    expect(result.current.state.status).toBe('error');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
