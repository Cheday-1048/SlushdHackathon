import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AnalyticsDashboard, Health, ReportingFilter } from '../api/schemas';

type DashboardState = { status: 'loading' } | { status: 'success'; data: AnalyticsDashboard } | { status: 'error'; message: string };
export type ConnectionState = { status: 'checking' } | { status: 'connected'; health: Health } | { status: 'disconnected'; message: string };

export function useDashboard() {
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<ReportingFilter>({ preset: 'demo' });
  const [dashboard, setDashboard] = useState<DashboardState>({ status: 'loading' });
  const [connection, setConnection] = useState<ConnectionState>({ status: 'checking' });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setDashboard({ status: 'loading' });
    void api.analyticsDashboard(filter, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setDashboard({ status: 'success', data }); },
      (error: unknown) => { if (!controller.signal.aborted) setDashboard({ status: 'error', message: error instanceof Error ? error.message : 'Dashboard request failed.' }); },
    );
    return () => controller.abort();
  }, [attempt, filter]);

  useEffect(() => {
    const controller = new AbortController();
    setConnection({ status: 'checking' });
    void api.health(controller.signal).then(
      (health) => { if (!controller.signal.aborted) setConnection({ status: 'connected', health }); },
      (error: unknown) => { if (!controller.signal.aborted) setConnection({ status: 'disconnected', message: error instanceof Error ? error.message : 'Health check failed.' }); },
    );
    return () => controller.abort();
  }, [attempt]);

  return { dashboard, connection, retry, filter, setFilter };
}
