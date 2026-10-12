import type { AnalyticsDashboard, Health, ReportingFilter } from '../api/schemas';
import { reportingFilterSchema } from '../api/schemas';
import { buildDemoDashboard } from './aggregate';

/** Demo Mode data source. Mirrors the parts of the API client that the Dashboard uses; no network access. */
const abortable = <T>(value: () => T, signal?: AbortSignal) => new Promise<T>((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
  // A short delay keeps loading states honest while the data is local.
  const timer = setTimeout(() => resolve(value()), 120);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

export const demoSource = {
  health: (signal?: AbortSignal): Promise<Health> => abortable(() => ({ status: 'ok' as const, service: 'Demo Mode (no backend)' }), signal),
  analyticsDashboard: (filter: ReportingFilter, signal?: AbortSignal): Promise<AnalyticsDashboard> =>
    abortable(() => buildDemoDashboard(reportingFilterSchema.parse(filter)), signal),
};
