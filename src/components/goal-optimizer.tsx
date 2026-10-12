import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { defaultOptimizationValues, optimizationFormSchema, optimizationSettings, type OptimizationFormOutput, type OptimizationFormValues, type OptimizationResponse, type RecommendedStrategy } from '../api/optimization';
import type { FinanceSummary } from '../api/schemas';
import { useOptimization } from '../hooks/use-optimization';
import { createMoneyFormatter } from '../lib/format-money';
import { simulationControls } from './simulation-controls';
import { Button } from './ui/button';

const fields: { key: keyof OptimizationFormValues; label: string; help: string }[] = [
  { key: 'target', label: 'Target operating profit increase (%)', help: 'Improvement relative to a positive historical operating profit.' },
  { key: 'discount', label: 'Maximum discount (%)', help: 'Additional discount after the selling price change, from 0 to this limit.' },
  { key: 'minPrice', label: 'Minimum selling price change (%)', help: 'Lower end of the permitted price range.' },
  { key: 'maxPrice', label: 'Maximum selling price change (%)', help: 'Upper end of the permitted price range.' },
  { key: 'advertising', label: 'Maximum advertising increase', help: 'Additional spending in the baseline currency. No traffic uplift is inferred.' },
  { key: 'expenses', label: 'Maximum additional operating expenses', help: 'Extra fixed operating costs in the baseline currency.' },
  { key: 'margin', label: 'Minimum operating profit margin (%)', help: 'Optional. Leave blank to apply no margin floor.' },
];
function OptimizationResults({ result, onTransfer }: { result: OptimizationResponse; onTransfer: (strategy: RecommendedStrategy) => void }) {
  const money = createMoneyFormatter(result.currency);
  const signed = (value: string) => `${Number(value) > 0 ? '+' : ''}${money(value)}`;
  return <section aria-label="Goal optimization results" className="simulation-results">
    <h2>{result.status === 'feasible' ? 'Recommended strategies' : result.status === 'target_not_achievable' ? 'Target not achievable under current assumptions' : 'Optimization unavailable'}</h2>
    <p className="simulation-context">{result.candidates_evaluated} candidates evaluated · {result.feasible_candidate_count} feasible · {result.reporting_period.start} to {result.reporting_period.end} · {result.currency}</p>
    <p>Ranked by expected operating profit within the tested grid, constraints and fixed assumptions. These are hypothetical strategies, not a guaranteed real-world optimum.</p>
    <div className="card data-details"><dl><div><dt>Historical operating profit</dt><dd>{money(result.baseline.operating_profit)}</dd></div><div><dt>Target operating profit</dt><dd>{money(result.target_operating_profit)}</dd></div><div><dt>Required profit increase</dt><dd>{money(result.target_profit_difference)}</dd></div></dl></div>
    {result.warnings.length > 0 && <div className="notice mock-notice" role="alert"><div><strong>Optimization warnings</strong><ul>{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div></div>}
    {result.status !== 'feasible' && <div className="notice" role="status"><p>{result.status === 'unavailable' ? 'This baseline cannot support percentage-goal optimization. Review the warnings or choose another period.' : 'No tested strategy reaches all requirements. Review your goal and decision limits; the search has not changed your behavioral assumptions to make the target achievable.'}</p></div>}
    <p className="muted small">Rejected checks: {result.rejections.below_profit_target} below target · {result.rejections.below_minimum_margin} below margin · {result.rejections.unavailable} unavailable. Each rejected candidate is counted once, at its first failed check.</p>
    <div className="optimizer-recommendations">{result.recommendations.map((strategy, index) => <article className="card data-details" key={strategy.id} aria-label={`Recommended strategy ${index + 1}`}>
      <h3>{index + 1}. {strategy.name}</h3><dl><div><dt>Expected revenue</dt><dd>{money(strategy.simulated.revenue)}</dd></div><div><dt>Expected operating profit</dt><dd>{money(strategy.simulated.operating_profit)}</dd></div><div><dt>Profit difference from baseline</dt><dd>{signed(strategy.differences.operating_profit)} ({strategy.differences.profit_change_pct ?? 'Not defined'}%)</dd></div><div><dt>Expected operating margin</dt><dd>{strategy.simulated.operating_profit_margin === null ? 'Not defined' : `${strategy.simulated.operating_profit_margin}%`}</dd></div><div><dt>Expected orders</dt><dd>{strategy.simulated.expected_orders}</dd></div></dl>
      <h4>Applied business parameters and assumptions</h4><dl>{simulationControls.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{strategy.parameters[key] === null ? 'Keep exact historical ratio' : key.endsWith('_amount') ? money(strategy.parameters[key]) : `${strategy.parameters[key]}%`}</dd></div>)}</dl>
      <h4>Constraints satisfied</h4><ul>{strategy.constraints_satisfied.map((item, i) => <li key={i}>{item}</li>)}</ul>
      <details><summary>Assumptions and limitations</summary><ul>{strategy.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul>{strategy.warnings.length > 0 && <ul>{strategy.warnings.map((item, i) => <li key={i}>{item}</li>)}</ul>}</details>
      <Button onClick={() => onTransfer(strategy)}>Send to A/B Arena</Button>
    </article>)}</div>
    {result.recommendations.length > 0 && <section className="card chart-card simulation-chart" aria-label="Strategy profit comparison chart"><h3>Expected operating profit</h3><p className="muted small">Historical profit and feasible strategies, in {result.currency}.</p><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={[{ name: 'Historical', profit: Number(result.baseline.operating_profit), exact: result.baseline.operating_profit }, ...result.recommendations.map((strategy, index) => ({ name: `Strategy ${index + 1}`, profit: Number(strategy.simulated.operating_profit), exact: strategy.simulated.operating_profit }))]}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis tickFormatter={(value: number) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value)} /><Tooltip formatter={(_value, _name, item) => money(item.payload.exact)} /><Bar dataKey="profit" name="Operating profit" fill="#245c4e" isAnimationActive={false} /></BarChart></ResponsiveContainer></div></section>}
    <section className="card data-details"><h3>Search constraints and assumptions</h3><ul>{result.constraint_explanations.map((item, i) => <li key={i}>{item}</li>)}</ul><ul>{result.assumptions.map((item, i) => <li key={i}>{item}</li>)}</ul><p className="small muted">Model {result.model_version} · Search {result.search_version}</p><code>{result.snapshot_id}</code></section>
    <p className="muted small">Sending a strategy opens two editable Arena drafts: the historical strategy and this recommendation. Compare scenarios recalculates a fresh shared baseline for the same period; changed historical records may change the results. Nothing is saved.</p>
  </section>;
}
export function GoalOptimizer({ baseline, ready, revision, onBaseline, onTransfer }: { baseline: FinanceSummary | null; ready: boolean; revision: number; onBaseline: (baseline: FinanceSummary) => void; onTransfer: (strategy: RecommendedStrategy) => void }) {
  const { state, run, invalidate } = useOptimization();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<OptimizationFormValues, unknown, OptimizationFormOutput>({ resolver: zodResolver(optimizationFormSchema), defaultValues: defaultOptimizationValues });
  const conversionMode = watch('conversionMode');
  useEffect(() => { invalidate(); }, [invalidate, revision, ready]);
  const input = (key: keyof OptimizationFormValues, label: string, help: string) => <div className="scenario-field" key={key}><label htmlFor={`optimizer-${key}`}>{label}</label><input id={`optimizer-${key}`} type="text" inputMode="decimal" {...register(key)} aria-invalid={Boolean(errors[key])} aria-describedby={`optimizer-${key}-help`} /><p id={`optimizer-${key}-help`} className="muted small">{help}</p>{errors[key] && <p className="filter-error" role="alert">{errors[key]?.message}</p>}</div>;
  return <>
    <form className="card scenario-form" aria-label="Goal optimizer controls" noValidate onChange={invalidate} onSubmit={handleSubmit(values => { if (baseline && ready) void run({ start_date: baseline.reporting_period.start, end_date: baseline.reporting_period.end, ...optimizationSettings(values) }, response => onBaseline(response.baseline)); })}>
      <h2>Goal Optimizer</h2><p className="muted small">Find up to three feasible strategies using one historical baseline. Decision ranges are searched; your conversion, traffic and cost assumptions stay fixed across every candidate.</p>
      <fieldset disabled={!ready}><legend className="sr-only">Goal and decision constraints</legend><div className="scenario-fields">{fields.map(field => input(field.key, field.label, field.help))}</div></fieldset>
      <h3>Behavioral assumptions</h3><p className="muted small">Customer responses to price, discounts and advertising are unknown. Neither conversion nor traffic is optimized or automatically increased.</p>
      <fieldset disabled={!ready}><legend className="sr-only">Fixed behavioral assumptions</legend><div className="scenario-fields"><div className="scenario-field"><label htmlFor="optimizer-conversion-mode">Conversion assumption</label><select id="optimizer-conversion-mode" {...register('conversionMode', { onChange: () => setValue('conversion', '') })}><option value="historical">Keep historical conversion</option><option value="explicit">Use an explicit assumption</option></select><p className="muted small">Historical mode uses the exact observed orders-to-visitors ratio.</p></div>{conversionMode === 'explicit' && input('conversion', 'Assumed conversion rate (%)', 'Your fixed hypothetical conversion rate from 0 to 100%. This is not a forecast.')}{input('visitors', 'Assumed visitor change (%)', 'Your fixed traffic change for every strategy, independent of advertising.')}{input('unitCost', 'Assumed unit cost change (%)', 'Your fixed supplier-cost assumption for every strategy.')}</div></fieldset>
      <p className="muted small">Bounded grid: 5 price points × 3 discount points × 2 advertising points × 2 expense points; equal values are deduplicated. Amounts use {baseline?.currency ?? 'the baseline currency'}. Conversion and traffic remain fixed.</p>
      <Button type="submit" disabled={!ready || state.status === 'loading'}>{state.status === 'loading' ? 'Finding strategies…' : 'Find Strategies'}</Button>
      <p className="muted small scenario-submit-help">Editing any input or period clears results and cancels pending work.</p>
    </form>
    {state.status === 'loading' && <p role="status" className="loading-message">Evaluating a bounded set of strategies from one shared baseline…</p>}
    {state.status === 'error' && <div className="notice error-notice" role="alert"><div><strong>Optimization request failed</strong><p>{state.message}</p><p>Review the inputs, then choose Find Strategies to retry.</p></div></div>}
    {state.status === 'idle' && <p role="status" className="muted small">Set a goal and explicit modeling assumptions, then find strategies.</p>}
    {state.status === 'success' && <OptimizationResults result={state.data} onTransfer={onTransfer} />}
  </>;
}
