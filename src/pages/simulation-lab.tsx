import type { ComparisonFormValues } from '../api/comparison';
import { GoalOptimizer } from '../components/goal-optimizer';
import { DecisionAssistant } from '../components/decision-assistant';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CircleDollarSign, FlaskConical, Percent, ShoppingBag, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { defaultSimulationValues, simulationFormSchema, simulationPeriodSchema, type SimulationFormValues, type SimulationParameters, type SimulationResponse } from '../api/simulation';
import { SimulationArena } from '../components/simulation-arena';
import { simulationControls as controls } from '../components/simulation-controls';
import { KpiCard } from '../components/kpi-card';
import { Button } from '../components/ui/button';
import { useSimulation } from '../hooks/use-simulation';
import { createMoneyFormatter } from '../lib/format-money';



function SimulationResults({ result }: { result: SimulationResponse }) {
  const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
  const money = createMoneyFormatter(result.currency);
  const percent = (value: string | null) => value === null ? 'Not defined' : `${numberFormat.format(Number(value))}%`;
  const signedMoney = (value: string) => `${Number(value) > 0 ? '+' : ''}${money(value)}`;
  const { baseline, simulated, differences } = result;

  return <section aria-label="Simulation results" className="simulation-results">
    <div className="reporting-period"><h2>{result.status === 'ready' ? 'Hypothetical results' : 'Simulation unavailable'}</h2><span className="badge">Aggregate scenario · {result.currency}</span></div>
    <p className="muted small simulation-context">{result.reporting_period.start} to {result.reporting_period.end} · Store {result.store_id}</p>
    <p className="simulation-context">These outcomes depend on your assumptions. They are not a forecast or a guaranteed change in customer behavior.</p>
    {result.warnings.length > 0 && <div className="notice mock-notice" role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Simulation warnings</strong><ul>{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div></div>}
    {result.status === 'unavailable' && <div className="notice" role="status"><p>This baseline cannot support a simulation. Review the warnings or choose another reporting period. Unavailable values have not been replaced with zero.</p></div>}
    {simulated && differences && <>
      <div className="simulation-deltas">
        <KpiCard label="Revenue difference" value={signedMoney(differences.revenue)} icon={CircleDollarSign} description={`Revenue change: ${percent(differences.revenue_change_pct)}`} />
        <KpiCard label="Operating profit difference" value={signedMoney(differences.operating_profit)} icon={Wallet} description={`Profit change: ${percent(differences.profit_change_pct)}${differences.profit_change_pct === null ? ' for a nonpositive baseline profit' : ''}`} />
      </div>
      <div className="card data-table-panel">
        <h3>Historical versus hypothetical</h3><p className="muted small">Expected orders are fractional estimates, not realized sales. Financial calculations use the full expected volume.</p>
        <div className="table-scroll"><table aria-label="Historical and hypothetical comparison"><thead><tr><th scope="col">Metric</th><th scope="col">Historical baseline</th><th scope="col">Hypothetical scenario</th></tr></thead><tbody>
          <tr><th scope="row">Revenue</th><td>{money(baseline.revenue)}</td><td>{money(simulated.revenue)}</td></tr>
          <tr><th scope="row">Orders / expected orders</th><td>{numberFormat.format(baseline.order_count)}</td><td>{numberFormat.format(Number(simulated.expected_orders))}</td></tr>
          <tr><th scope="row">Visitors / expected visitors</th><td>{numberFormat.format(baseline.visitors)}</td><td>{numberFormat.format(Number(simulated.expected_visitors))}</td></tr>
          <tr><th scope="row">Conversion rate</th><td>{percent(baseline.conversion_rate)}</td><td>{percent(simulated.assumed_conversion_rate)} <span className="muted small">({simulated.conversion_rate_source === 'historical_ratio' ? 'exact historical ratio' : 'user assumption'})</span></td></tr>
          <tr><th scope="row">Cost of goods sold</th><td>{money(baseline.cogs)}</td><td>{money(simulated.cogs)}</td></tr>
          <tr><th scope="row">Gross profit</th><td>{money(baseline.gross_profit)}</td><td>{money(simulated.gross_profit)}</td></tr>
          <tr><th scope="row">Gross profit margin</th><td>{percent(baseline.gross_profit_margin)}</td><td>{percent(simulated.gross_profit_margin)}</td></tr>
          <tr><th scope="row">Operating expenses</th><td>{money(baseline.operating_expenses)}</td><td>{money(simulated.operating_expenses)}</td></tr>
          <tr><th scope="row">Advertising expenditure</th><td>{money(baseline.advertising_expenditure)}</td><td>{money(simulated.advertising_expenditure)}</td></tr>
          <tr><th scope="row">Operating profit</th><td>{money(baseline.operating_profit)}</td><td>{money(simulated.operating_profit)}</td></tr>
          <tr><th scope="row">Operating profit margin</th><td>{percent(baseline.operating_profit_margin)}</td><td>{percent(simulated.operating_profit_margin)}</td></tr>
        </tbody></table></div>
      </div>
      <section className="card chart-card simulation-chart" aria-label="Revenue and profit comparison chart"><h3>Revenue and operating profit</h3><p className="muted small">Historical baseline compared with this hypothetical scenario, in {result.currency}.</p>
        <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={[
          { metric: 'Revenue', Historical: Number(baseline.revenue), Hypothetical: Number(simulated.revenue), historicalExact: baseline.revenue, hypotheticalExact: simulated.revenue },
          { metric: 'Operating profit', Historical: Number(baseline.operating_profit), Hypothetical: Number(simulated.operating_profit), historicalExact: baseline.operating_profit, hypotheticalExact: simulated.operating_profit },
        ]} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="metric" /><YAxis tickFormatter={(value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} /><Tooltip formatter={(_value, name, item) => money(name === 'Historical' ? item.payload.historicalExact : item.payload.hypotheticalExact)} /><Legend /><ReferenceLine y={0} stroke="#5e6b7b" /><Bar dataKey="Historical" fill="#8a9aa9" isAnimationActive={false} /><Bar dataKey="Hypothetical" fill="#245c4e" isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
      </section>
    </>}
    <section className="card data-details"><h3>Applied scenario inputs</h3><dl>{controls.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{result.parameters[key] === null ? 'Keep exact historical ratio' : key.endsWith('_amount') ? money(result.parameters[key]) : `${result.parameters[key]}%`}</dd></div>)}</dl><h3>Model assumptions</h3><ul className="assumptions-list">{result.assumptions.map((assumption, index) => <li key={`${index}-${assumption}`}>{assumption}</li>)}</ul></section>
  </section>;
}

export function SimulationLabPage({ initialMode = 'single' }: { initialMode?: 'single' | 'assistant' } = {}) {
  const { acceptBaseline, baseline, preview, loadBaseline, retryBaseline, run, invalidatePreview } = useSimulation();
  const [mode, setMode] = useState<'single' | 'arena' | 'optimizer' | 'assistant'>(initialMode);
  const [arenaSeed, setArenaSeed] = useState<ComparisonFormValues['scenarios'] | undefined>();
  const [arenaRevision, setArenaRevision] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<SimulationFormValues, unknown, SimulationParameters>({ resolver: zodResolver(simulationFormSchema), defaultValues: defaultSimulationValues });
  const baselineStart = baseline.status === 'success' ? baseline.data.reporting_period.start : undefined;
  const baselineEnd = baseline.status === 'success' ? baseline.data.reporting_period.end : undefined;
  useEffect(() => { if (baselineStart && baselineEnd) { setStart(baselineStart); setEnd(baselineEnd); } }, [baselineStart, baselineEnd]);
  const periodDirty = baseline.status === 'success' && (start !== baselineStart || end !== baselineEnd);
  const ready = baseline.status === 'success' && !periodDirty;

  return <>
    <header className="page-header"><div><p className="eyebrow">RETAIL DECISION LAB</p><h1>Simulation Lab</h1><p className="muted">Explore a hypothetical decision using your stored business data.</p></div><FlaskConical size={26} aria-hidden="true" /></header>
    <div className="notice mock-notice"><span className="badge">Hypothetical</span><p>Conversion and traffic are your assumptions. This deterministic model does not predict customer behavior or change business records.</p></div>
    <form className="card reporting-filter" aria-label="Simulation reporting period" noValidate onSubmit={(event) => {
      event.preventDefault();
      const parsed = simulationPeriodSchema.safeParse({ start_date: start, end_date: end });
      if (!parsed.success) { setPeriodError(!start || !end ? 'Choose both a start and end date.' : parsed.error.issues[0].message); return; }
      setPeriodError(null); setArenaRevision((value) => value + 1); loadBaseline(parsed.data);
    }}><div className="filter-fields">
      <label>Baseline start date<input type="date" value={start} onChange={(event) => { setStart(event.target.value); invalidatePreview(); setArenaRevision((value) => value + 1); setPeriodError(null); }} aria-invalid={Boolean(periodError)} /></label>
      <label>Baseline end date<input type="date" value={end} onChange={(event) => { setEnd(event.target.value); invalidatePreview(); setArenaRevision((value) => value + 1); setPeriodError(null); }} aria-invalid={Boolean(periodError)} /></label>
      <Button type="submit" disabled={baseline.status === 'loading'}>Load baseline</Button>
    </div><p className="muted small">Dates include both endpoints, up to 366 days. The initial period comes from the stored demo data.</p>
      {periodDirty && <p className="filter-error" role="status">Load this reporting period before running a simulation.</p>}
      {periodError && <p className="filter-error" role="alert">{periodError}</p>}
    </form>
    {baseline.status === 'loading' && <p className="loading-message" role="status">Loading historical baseline…</p>}
    {baseline.status === 'error' && <section className="card error-panel" role="alert"><h2>Baseline unavailable</h2><p>{baseline.message}</p><Button onClick={retryBaseline}>Retry baseline</Button></section>}
    {baseline.status === 'success' && (() => {
      const data = baseline.data;
      const money = createMoneyFormatter(data.currency);
      return <>
        <div className="reporting-period"><h2>Historical baseline</h2><span className="muted small">{data.reporting_period.start} to {data.reporting_period.end} · {data.currency}</span></div>
        <p className="muted small simulation-context">{data.data_source.description}</p>
        {!data.data_completeness.is_complete && <div className="notice mock-notice" role="alert"><div><strong>Baseline data is incomplete</strong><ul>{data.data_completeness.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div></div>}
        {data.order_count === 0 && <div className="notice" role="status"><p>No recorded orders in this period. A sales baseline is needed to estimate future order value and product costs.</p></div>}
        <section className="kpi-grid simulation-baseline" aria-label="Historical baseline metrics">
          <KpiCard label="Baseline revenue" value={money(data.revenue)} icon={CircleDollarSign} description="Net sales, excluding VAT" />
          <KpiCard label="Baseline orders" value={new Intl.NumberFormat('en-US').format(data.order_count)} icon={ShoppingBag} description="Realized historical order count" />
          <KpiCard label="Baseline conversion rate" value={data.conversion_rate === null ? 'Unavailable' : `${data.conversion_rate}%`} icon={Percent} description="Displayed rounded; model uses the exact ratio" />
          <KpiCard label="Baseline operating profit" value={money(data.operating_profit)} icon={Wallet} description="After operating costs and advertising" />
        </section>
      </>;
    })()}
    <div className="arena-toolbar" role="group" aria-label="Simulation mode"><Button variant={mode === 'single' ? 'default' : 'outline'} aria-pressed={mode === 'single'} onClick={() => { setMode('single'); setArenaSeed(undefined); invalidatePreview(); }}>Single scenario</Button><Button variant={mode === 'arena' ? 'default' : 'outline'} aria-pressed={mode === 'arena'} onClick={() => { setMode('arena'); setArenaSeed(undefined); invalidatePreview(); }}>A/B Arena</Button><Button variant={mode === 'optimizer' ? 'default' : 'outline'} aria-pressed={mode === 'optimizer'} onClick={() => { setMode('optimizer'); setArenaSeed(undefined); invalidatePreview(); }}>Goal Optimizer</Button><Button variant={mode === 'assistant' ? 'default' : 'outline'} aria-pressed={mode === 'assistant'} onClick={() => { setMode('assistant'); setArenaSeed(undefined); invalidatePreview(); }}>AI Assistant</Button></div>
    {mode === 'assistant' ? <DecisionAssistant baseline={baseline.status === 'success' ? baseline.data : null} ready={ready} revision={arenaRevision} onBaseline={acceptBaseline} onTransfer={(strategy) => { setArenaSeed([{ id: crypto.randomUUID(), name: 'Historical baseline', parameters: { ...defaultSimulationValues } }, { id: crypto.randomUUID(), name: strategy.name, parameters: { ...strategy.parameters, expected_conversion_rate: strategy.parameters.expected_conversion_rate ?? '' } }]); setMode('arena'); invalidatePreview(); }} /> : mode === 'optimizer' ? <GoalOptimizer baseline={baseline.status === 'success' ? baseline.data : null} ready={ready} revision={arenaRevision} onBaseline={acceptBaseline} onTransfer={(strategy) => { setArenaSeed([{ id: crypto.randomUUID(), name: 'Historical baseline', parameters: { ...defaultSimulationValues } }, { id: crypto.randomUUID(), name: strategy.name, parameters: { ...strategy.parameters, expected_conversion_rate: strategy.parameters.expected_conversion_rate ?? '' } }]); setMode('arena'); invalidatePreview(); }} /> : mode === 'arena' ? <SimulationArena seedScenarios={arenaSeed} baseline={baseline.status === 'success' ? baseline.data : null} ready={ready} revision={arenaRevision} onBaseline={acceptBaseline} /> : <>
    <form className="card scenario-form" aria-label="Scenario controls" noValidate onChange={invalidatePreview} onSubmit={handleSubmit(run)}>
      <h2>Scenario assumptions</h2><p className="muted small">Price changes and additional discounts are sequential. Historical discounts are already reflected in the baseline. Monetary inputs use {baseline.status === 'success' ? baseline.data.currency : 'the baseline currency'} for the selected period.</p>
      <fieldset disabled={!ready}><legend className="sr-only">Simulation parameters</legend><div className="scenario-fields">{controls.map(({ key, label, help }) => <div className="scenario-field" key={key}>
        <label htmlFor={`scenario-${key}`}>{label}</label><input id={`scenario-${key}`} type="text" inputMode="decimal" {...register(key)} aria-invalid={Boolean(errors[key])} aria-describedby={`scenario-help-${key}${errors[key] ? ` scenario-error-${key}` : ''}`} />
        <p id={`scenario-help-${key}`} className="muted small">{help}</p>{errors[key] && <p id={`scenario-error-${key}`} className="filter-error" role="alert">{errors[key]?.message}</p>}
      </div>)}</div></fieldset>
      <Button type="submit" disabled={!ready || preview.status === 'loading'}><FlaskConical size={16} aria-hidden="true" />{preview.status === 'loading' ? 'Running simulation…' : 'Run simulation'}</Button>
      <p className="muted small scenario-submit-help">Editing any scenario input clears the previous result. Only the inputs applied to a completed run appear in its results.</p>
    </form>
    {preview.status === 'loading' && <p role="status" className="loading-message">Calculating hypothetical results…</p>}
    {preview.status === 'error' && <section className="notice error-notice" role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Simulation unavailable</strong><p>{preview.message}</p><p>Adjust the inputs if needed, then choose Run simulation to retry.</p></div></section>}
    {preview.status === 'idle' && <p className="muted small" role="status">Set your assumptions and run a simulation to compare outcomes.</p>}
    {preview.status === 'success' && <SimulationResults result={preview.data} />}
    </>}
    <footer className="page-footer">Phase 08 · AI-assisted strategy exploration · No changes to historical records</footer>
  </>;
}
