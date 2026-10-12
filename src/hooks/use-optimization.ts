import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { OptimizationRequest, OptimizationResponse } from '../api/optimization';
type State = { status: 'idle' } | { status: 'loading' } | { status: 'success'; data: OptimizationResponse } | { status: 'error'; message: string };
export function useOptimization() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const active = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { active.current?.abort(); active.current = null; setState({ status: 'idle' }); }, []);
  useEffect(() => () => active.current?.abort(), []);
  const run = useCallback(async (request: OptimizationRequest, onSuccess: (data: OptimizationResponse) => void) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller; setState({ status: 'loading' });
    try {
      const data = await api.optimizeGoal(request, controller.signal);
      if (controller.signal.aborted) return;
      if (data.reporting_period.start !== request.start_date || data.reporting_period.end !== request.end_date) throw new Error('The API returned results for a different reporting period. Please retry.');
      setState({ status: 'success', data }); onSuccess(data);
    } catch (error) { if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'Optimization request failed.' }); }
  }, []);
  return { state, run, invalidate };
}
