import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ComparisonRequest, ComparisonResponse } from '../api/comparison';

type ComparisonState = { status: 'idle' } | { status: 'loading' } | { status: 'success'; data: ComparisonResponse } | { status: 'error'; message: string };
export function useComparison() {
  const [state, setState] = useState<ComparisonState>({ status: 'idle' });
  const active = useRef<AbortController | null>(null);
  const invalidate = useCallback(() => { active.current?.abort(); active.current = null; setState({ status: 'idle' }); }, []);
  useEffect(() => () => active.current?.abort(), []);
  const run = useCallback(async (request: ComparisonRequest, onSuccess: (data: ComparisonResponse) => void) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setState({ status: 'loading' });
    try {
      const data = await api.simulationCompare(request, controller.signal);
      if (!controller.signal.aborted) {
        // Reject a mismatched successful response before attaching it to edited inputs.
        if (data.reporting_period.start !== request.start_date || data.reporting_period.end !== request.end_date || data.scenarios.length !== request.scenarios.length || data.scenarios.some((scenario, index) => scenario.id !== request.scenarios[index].id)) throw new Error('The API returned a comparison for different scenarios. Please retry.');
        setState({ status: 'success', data });
        onSuccess(data);
      }
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'Comparison request failed.' });
    }
  }, []);
  return { state, run, invalidate };
}
