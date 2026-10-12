import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { assistantRequestSchema, type AssistantResponse } from '../api/assistant';
import type { RecommendedStrategy } from '../api/optimization';
import type { FinanceSummary } from '../api/schemas';
import { createMoneyFormatter } from '../lib/format-money';
import { simulationControls } from './simulation-controls';
import { Button } from '@/shared/components/ui/button';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'success'; question: string; data: AssistantResponse };

function AssistantResults({ question, data, onTransfer }: { question: string; data: AssistantResponse; onTransfer: (strategy: RecommendedStrategy) => void }) {
  const result = data.optimization;
  const metrics = data.metrics;
  const money = createMoneyFormatter(result?.currency ?? metrics?.currency ?? 'USD');
  return <section className="simulation-results" aria-label="AI assistant response" aria-live="polite">
    <section className="card data-details"><h3>Your request</h3><p className="assistant-message">{question}</p><h3>Assistant response</h3><p className="assistant-message">{data.message}</p></section>
    {metrics && <section className="card data-details" aria-label="Assistant historical metrics"><h3>Historical store metrics</h3><p className="muted small">{metrics.reporting_period.start} to {metrics.reporting_period.end} · {metrics.currency} · {metrics.data_source.description}</p><dl><div><dt>Revenue</dt><dd>{money(metrics.revenue)}</dd></div><div><dt>Operating profit</dt><dd>{money(metrics.operating_profit)}</dd></div><div><dt>Advertising expenditure</dt><dd>{money(metrics.advertising_expenditure)}</dd></div><div><dt>Recorded orders</dt><dd>{metrics.order_count}</dd></div><div><dt>Recorded visitors</dt><dd>{metrics.visitors}</dd></div></dl>{metrics.data_completeness.warnings.length > 0 && <ul>{metrics.data_completeness.warnings.map((item, i) => <li key={i}>{item}</li>)}</ul>}</section>}
    {result && <>
      <h2>{result.status === 'feasible' ? 'Calculated hypothetical strategies' : result.status === 'target_not_achievable' ? 'No tested strategy reaches the target' : 'Optimization unavailable'}</h2>
      <p>{result.candidates_evaluated} candidates evaluated · {result.feasible_candidate_count} feasible · {result.reporting_period.start} to {result.reporting_period.end} · {result.currency}</p>
      <p>Financial results come from the existing simulation and optimization engines. These outcomes depend on the applied assumptions; they are not forecasts or guaranteed business results.</p>
      <section className="card data-details" aria-label="Applied assistant optimization request"><h3>Applied goal and decision limits</h3><dl>
        <div><dt>Target operating profit increase</dt><dd>{result.request.target_profit_increase_pct}%</dd></div><div><dt>Target operating profit</dt><dd>{money(result.target_operating_profit)}</dd></div><div><dt>Historical operating profit</dt><dd>{money(result.baseline.operating_profit)}</dd></div>
        <div><dt>Selling price change range</dt><dd>{result.request.constraints.min_selling_price_change_pct}% to {result.request.constraints.max_selling_price_change_pct}%</dd></div><div><dt>Maximum additional discount</dt><dd>{result.request.constraints.max_discount_pct}%</dd></div><div><dt>Maximum advertising increase</dt><dd>{money(result.request.constraints.max_advertising_increase_amount)}</dd></div><div><dt>Maximum additional operating expenses</dt><dd>{money(result.request.constraints.max_additional_operating_expense_amount)}</dd></div><div><dt>Minimum operating profit margin</dt><dd>{result.request.constraints.minimum_operating_profit_margin_pct === null ? 'No margin floor' : `${result.request.constraints.minimum_operating_profit_margin_pct}%`}</dd></div>
        <div><dt>Conversion assumption</dt><dd>{result.request.behavioral_assumptions.conversion_mode === 'historical' ? 'Keep exact historical ratio' : `${result.request.behavioral_assumptions.expected_conversion_rate}% (explicit assumption)`}</dd></div><div><dt>Assumed visitor change</dt><dd>{result.request.behavioral_assumptions.visitor_change_pct}%</dd></div><div><dt>Assumed unit cost change</dt><dd>{result.request.behavioral_assumptions.unit_cost_change_pct}%</dd></div>
      </dl></section>
      {result.warnings.length > 0 && <div className="notice mock-notice" role="alert"><div><strong>Optimization limitations</strong><ul>{result.warnings.map((item, i) => <li key={i}>{item}</li>)}</ul></div></div>}
      <div className="optimizer-recommendations">{result.recommendations.map((strategy, index) => <article key={strategy.id} className="card data-details" aria-label={`Assistant strategy ${index + 1}`}><h3>{strategy.name}</h3><dl>
        <div><dt>Hypothetical revenue</dt><dd>{money(strategy.simulated.revenue)}</dd></div><div><dt>Hypothetical operating profit</dt><dd>{money(strategy.simulated.operating_profit)}</dd></div><div><dt>Profit difference from historical baseline</dt><dd>{money(strategy.differences.operating_profit)}</dd></div><div><dt>Hypothetical operating margin</dt><dd>{strategy.simulated.operating_profit_margin === null ? 'Not defined' : `${strategy.simulated.operating_profit_margin}%`}</dd></div><div><dt>Expected orders</dt><dd>{strategy.simulated.expected_orders}</dd></div>
      </dl><h4>Applied strategy inputs</h4><dl>{simulationControls.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{strategy.parameters[key] === null ? 'Keep exact historical ratio' : key.endsWith('_amount') ? money(strategy.parameters[key]) : `${strategy.parameters[key]}%`}</dd></div>)}</dl><h4>Constraints satisfied</h4><ul>{strategy.constraints_satisfied.map((item, i) => <li key={i}>{item}</li>)}</ul><details><summary>Strategy assumptions and limitations</summary><ul>{[...strategy.assumptions, ...strategy.warnings].map((item, i) => <li key={i}>{item}</li>)}</ul></details><Button onClick={() => onTransfer(strategy)}>Send to A/B Arena</Button></article>)}</div>
      <section className="card data-details"><h3>Search assumptions and limitations</h3><ul>{[...result.constraint_explanations, ...result.assumptions].map((item, i) => <li key={i}>{item}</li>)}</ul><p className="muted small">Sending a strategy opens editable historical and recommended Arena drafts for the same period. Compare scenarios recalculates a shared baseline. Nothing is saved.</p></section>
    </>}
  </section>;
}

export function DecisionAssistant({ baseline, ready, revision, onBaseline, onTransfer }: { baseline: FinanceSummary | null; ready: boolean; revision: number; onBaseline: (baseline: FinanceSummary) => void; onTransfer: (strategy: RecommendedStrategy) => void }) {
  const [message, setMessage] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const active = useRef<AbortController | null>(null);
  const start = baseline?.reporting_period.start;
  const end = baseline?.reporting_period.end;
  useEffect(() => { active.current?.abort(); active.current = null; setState({ status: 'idle' }); }, [revision, ready, start, end]);
  useEffect(() => () => active.current?.abort(), []);
  async function submit() {
    if (!ready || !baseline) return;
    const parsed = assistantRequestSchema.safeParse({ message, start_date: baseline.reporting_period.start, end_date: baseline.reporting_period.end });
    if (!parsed.success) { setState({ status: 'error', message: parsed.error.issues[0].message }); return; }
    active.current?.abort();
    const controller = new AbortController(); active.current = controller; setState({ status: 'loading' });
    try {
      const data = await api.assistantChat(parsed.data, controller.signal);
      if (controller.signal.aborted) return;
      for (const period of [data.metrics?.reporting_period, data.optimization?.reporting_period]) {
        if (period && (period.start !== parsed.data.start_date || period.end !== parsed.data.end_date)) throw new Error('The assistant returned results for a different reporting period. Please retry.');
      }
      setState({ status: 'success', question: parsed.data.message, data });
      const refreshed = data.optimization?.baseline ?? data.metrics;
      if (refreshed) onBaseline(refreshed);
    } catch (error) {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : 'The assistant request failed. Please retry.' });
    }
  }
  return <>
    <form className="card scenario-form" aria-label="AI decision assistant" noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
      <h2>AI Decision Assistant</h2><p className="muted small">Describe a merchant goal to retrieve demo-store metrics and explore calculated strategies. Each message is independent; repeat your complete goal and constraints in every request.</p>
      <p className="muted small">Unless you specify other limits: selling price changes from 0% to 10%, additional discounts from 0% to 10%, no advertising increase, no additional operating expenses, and unchanged conversion, traffic and unit costs. Review the applied limits below each answer.</p>
      <fieldset disabled={!ready}><legend className="sr-only">Merchant goal</legend><div className="scenario-field"><label htmlFor="assistant-goal">Your business goal</label><textarea id="assistant-goal" value={message} maxLength={2000} rows={4} aria-describedby="assistant-goal-help" onChange={event => { active.current?.abort(); active.current = null; setState({ status: 'idle' }); setMessage(event.target.value); }} placeholder="Increase my operating profit by 20% without increasing advertising costs." /><p id="assistant-goal-help" className="muted small">Use the selected historical period. Only the configured demo store is available. Editing the message or period clears previous results.</p></div></fieldset>
      <Button type="submit" disabled={!ready || state.status === 'loading'}>{state.status === 'loading' ? 'Evaluating your goal…' : 'Ask assistant'}</Button>
    </form>
    {state.status === 'loading' && <p className="loading-message" role="status">Interpreting your goal and calling the authorized business tools…</p>}
    {state.status === 'error' && <section className="notice error-notice" role="alert"><div><strong>Assistant unavailable</strong><p>{state.message}</p><p>Your message has been kept. Retry when the issue is resolved, or use Goal Optimizer directly.</p></div></section>}
    {state.status === 'success' && <AssistantResults question={state.question} data={state.data} onTransfer={onTransfer} />}
  </>;
}
