import { optimizationRequestSchema, optimizationResponseSchema, type OptimizationRequest } from './optimization';
import { assistantRequestSchema, assistantResponseSchema, type AssistantRequest } from './assistant';
import { comparisonRequestSchema, comparisonResponseSchema, type ComparisonRequest } from './comparison';
import { z } from 'zod';
import { analyticsDashboardSchema, dashboardSummarySchema, financeSummarySchema, healthSchema, reportingFilterSchema, type ReportingFilter } from './schemas';
import { simulationPeriodSchema, simulationRequestSchema, simulationResponseSchema, type SimulationPeriod, type SimulationRequest } from './simulation';

/** Demo Mode serves the bundled sample dataset and never contacts a backend. Read at call time so tests can toggle it. */
export const isDemoMode = () => import.meta.env.VITE_DEMO_MODE === 'true';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.PROD ? window.location.origin : 'http://127.0.0.1:8000')).replace(/\/+$/, '');
const serverErrorSchema = z.object({ message: z.string() });
const validationErrorSchema = z.object({ detail: z.array(z.object({ msg: z.string() })).min(1) });

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = 'ApiError'; }
}

export async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, postBody?: unknown, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const url = new URL(`${API_BASE_URL}${path}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ApiError('VITE_API_BASE_URL must be a valid HTTP(S) URL.');
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(postBody !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(postBody !== undefined ? { method: 'POST', body: JSON.stringify(postBody) } : {}),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = serverErrorSchema.safeParse(body);
      const validationError = response.status === 422 ? validationErrorSchema.safeParse(body) : null;
      if (!error.success && validationError?.success) throw new ApiError(`Please check the scenario: ${validationError.data.detail.slice(0, 3).map((issue) => issue.msg).join(' ')}`, response.status);
      throw new ApiError(error.success ? error.data.message : `The API returned HTTP ${response.status}. Please retry.`, response.status);
    }
    const body = await response.json().catch(() => { throw new ApiError('The API returned invalid JSON. Please retry or check the backend.'); });
    const data = schema.safeParse(body);
    if (!data.success) throw new ApiError('The API returned an invalid response. Please retry or check the backend.');
    return data.data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError('The API took too long to respond. Check the backend and retry.');
    throw new ApiError('Cannot reach the API. Check the backend server, API URL, and CORS configuration, then retry.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function analyticsPath(filter: ReportingFilter) {
  const checked = reportingFilterSchema.parse(filter);
  const query = new URLSearchParams();
  if (checked.preset === 'custom') {
    query.set('start_date', checked.start_date);
    query.set('end_date', checked.end_date);
  } else if (checked.preset !== 'demo') query.set('preset', checked.preset);
  return `/api/analytics/dashboard${query.size ? `?${query.toString()}` : ''}`;
}

export const api = {
  health: (signal?: AbortSignal) => isDemoMode() ? import('../demo/source').then(({ demoSource }) => demoSource.health(signal)) : request('/health', healthSchema, signal),
  dashboardSummary: (signal?: AbortSignal) => request('/api/dashboard/summary', dashboardSummarySchema, signal),
  financeSummary: (signal?: AbortSignal) => request('/api/finance/summary', financeSummarySchema, signal),
  financeBaseline: (period?: SimulationPeriod, signal?: AbortSignal) => {
    const query = period ? `?${new URLSearchParams(simulationPeriodSchema.parse(period)).toString()}` : '';
    return request(`/api/finance/summary${query}`, financeSummarySchema, signal);
  },
  optimizeGoal: (goal: OptimizationRequest, signal?: AbortSignal) => request('/api/optimization/goal', optimizationResponseSchema, signal, optimizationRequestSchema.parse(goal)),
  assistantChat: (message: AssistantRequest, signal?: AbortSignal) => request('/api/assistant/chat', assistantResponseSchema, signal, assistantRequestSchema.parse(message), 55000),
  simulationCompare: (comparison: ComparisonRequest, signal?: AbortSignal) => request('/api/simulations/compare', comparisonResponseSchema, signal, comparisonRequestSchema.parse(comparison)),
  simulationPreview: (scenario: SimulationRequest, signal?: AbortSignal) => request('/api/simulations/preview', simulationResponseSchema, signal, simulationRequestSchema.parse(scenario)),
  analyticsDashboard: (filter: ReportingFilter, signal?: AbortSignal) => isDemoMode()
    ? import('../demo/source').then(({ demoSource }) => demoSource.analyticsDashboard(filter, signal))
    : request(analyticsPath(filter), analyticsDashboardSchema, signal),
};
