import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { useDashboard } from '../hooks/use-dashboard';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Demo Mode data source', () => {
  it('serves the dashboard without any network request', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be used'));
    const data = await api.analyticsDashboard({ preset: 'demo' });
    expect(data.summary.revenue).toBe('29371.63');
    expect(data.summary.data_source.description).toMatch(/Nova Commerce/);
    expect((await api.health()).service).toBe('Demo Mode (no backend)');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the real API client when Demo Mode is off', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false');
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(api.health()).rejects.toThrow(/Cannot reach the API/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects when the request is aborted', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    const controller = new AbortController();
    const pending = api.analyticsDashboard({ preset: 'demo' }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('drives the dashboard hook: no health check, filters and refresh work', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    const health = vi.spyOn(api, 'health');
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.dashboard.status).toBe('success'));
    expect(result.current.connection).toEqual({ status: 'demo' });
    expect(health).not.toHaveBeenCalled();
    const before = result.current.dashboard.status === 'success' ? result.current.dashboard.data.summary.revenue : '';
    act(() => result.current.setFilter({ preset: 'custom', start_date: '2026-09-10', end_date: '2026-09-16' }));
    await waitFor(() => expect(result.current.dashboard.status === 'success' && result.current.dashboard.data.summary.revenue).not.toBe(before));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.dashboard.status).toBe('success'));
    expect(result.current.dashboard.status === 'success' && result.current.dashboard.data.summary.reporting_period).toEqual({ start: '2026-09-10', end: '2026-09-16' });
  });
});
