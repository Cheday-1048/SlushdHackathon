import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { FinanceSummary } from '../api/schemas';
import type { SimulationParameters, SimulationPeriod, SimulationResponse } from '../api/simulation';

type BaselineState = { status: 'loading' } | { status: 'success'; data: FinanceSummary } | { status: 'error'; message: string };
type PreviewState = { status: 'idle' } | { status: 'loading' } | { status: 'success'; data: SimulationResponse } | { status: 'error'; message: string };

export function useSimulation() {
  const [period, setPeriod] = useState<SimulationPeriod | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [baseline, setBaseline] = useState<BaselineState>({ status: 'loading' });
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' });
  const baselineController = useRef<AbortController | null>(null);
  const previewController = useRef<AbortController | null>(null);

  const invalidatePreview = useCallback(() => {
    previewController.current?.abort();
    previewController.current = null;
    setPreview({ status: 'idle' });
  }, []);

  const loadBaseline = useCallback((nextPeriod?: SimulationPeriod) => {
    baselineController.current?.abort();
    invalidatePreview();
    setBaseline({ status: 'loading' });
    setPeriod(nextPeriod);
    setAttempt((value) => value + 1);
  }, [invalidatePreview]);

  const retryBaseline = useCallback(() => loadBaseline(period), [loadBaseline, period]);

  useEffect(() => {
    const controller = new AbortController();
    baselineController.current = controller;
    setBaseline({ status: 'loading' });
    void api.financeBaseline(period, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setBaseline({ status: 'success', data }); },
      (error: unknown) => { if (!controller.signal.aborted) setBaseline({ status: 'error', message: error instanceof Error ? error.message : 'Baseline request failed.' }); },
    );
    return () => controller.abort();
  }, [attempt, period]);

  useEffect(() => () => previewController.current?.abort(), []);

  const run = useCallback(async (parameters: SimulationParameters) => {
    if (baseline.status !== 'success') return;
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setPreview({ status: 'loading' });
    const { start, end } = baseline.data.reporting_period;
    try {
      const data = await api.simulationPreview({ start_date: start, end_date: end, parameters }, controller.signal);
      if (!controller.signal.aborted) {
        // The preview transaction is authoritative if history changed after loading.
        setBaseline({ status: 'success', data: data.baseline });
        setPreview({ status: 'success', data });
      }
    } catch (error) {
      if (!controller.signal.aborted) setPreview({ status: 'error', message: error instanceof Error ? error.message : 'Simulation request failed.' });
    }
  }, [baseline]);

  const acceptBaseline = useCallback((data: FinanceSummary) => setBaseline({ status: 'success', data }), []);

  return { acceptBaseline, baseline, preview, loadBaseline, retryBaseline, run, invalidatePreview };
}
