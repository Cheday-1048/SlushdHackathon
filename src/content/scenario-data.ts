import { buildDemoDashboard } from '@/demo/aggregate';
import examples from '@/demo/engine-examples.json';
import type { ScenarioVisual } from './guide';

/*
 * Numbers for the Guide's business scenario.
 *  - Steps 1-2 are computed from the Nova Commerce demo dataset (same data as the Dashboard).
 *  - Steps 4-6 come from the backend's own Simulation, A/B Arena and Goal Optimizer services, run once on the same
 *    dataset (src/demo/engine-examples.json). They are hypothetical results under stated assumptions, not forecasts.
 */

const before = { start: '2026-09-08', end: '2026-09-14' };
const after = { start: '2026-09-15', end: '2026-09-21' };
const week = (period: { start: string; end: string }) => buildDemoDashboard({ preset: 'custom', start_date: period.start, end_date: period.end });

const a = week(before);
const b = week(after);
const dollars = (value: number | string, signed = false) => {
  const amount = Number(value);
  const text = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(amount));
  return `${amount < 0 ? '−' : signed ? '+' : ''}${text}`;
};
const exact = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
const pct = (value: string | null) => (value === null ? 'n/a' : `${Number(value).toFixed(1)}%`);
const change = (from: number, to: number) => ((to - from) / from) * 100;
const expense = (week: ReturnType<typeof buildDemoDashboard>, category: string) => Number(week.expenses.find((item) => item.category === category)?.amount ?? 0);

export const facts = {
  before, after,
  revenueChangePct: change(Number(a.summary.revenue), Number(b.summary.revenue)),
  marginBefore: Number(a.summary.operating_profit_margin),
  marginAfter: Number(b.summary.operating_profit_margin),
  grossMarginBefore: Number(a.summary.gross_profit_margin),
  grossMarginAfter: Number(b.summary.gross_profit_margin),
  employeeCostIncrease: expense(b, 'employee_costs') - expense(a, 'employee_costs'),
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sep 8–14", or "Aug 28 – Sep 3" across months. */
export const periodLabel = (period: { start: string; end: string }) => {
  const [, startMonth, startDay] = period.start.split('-').map(Number);
  const [, endMonth, endDay] = period.end.split('-').map(Number);
  return startMonth === endMonth ? `${MONTHS[startMonth - 1]} ${startDay}–${endDay}` : `${MONTHS[startMonth - 1]} ${startDay} – ${MONTHS[endMonth - 1]} ${endDay}`;
};
export const beforeLabel = periodLabel(before);
export const afterLabel = periodLabel(after);

export const seeVisual: ScenarioVisual = {
  kind: 'metrics',
  items: [
    { label: 'Revenue', before: exact(a.summary.revenue ?? 0), after: exact(b.summary.revenue ?? 0), tone: 'good' },
    { label: 'Operating profit', before: exact(a.summary.operating_profit ?? 0), after: exact(b.summary.operating_profit ?? 0), tone: 'bad' },
    { label: 'Operating margin', before: pct(a.summary.operating_profit_margin), after: pct(b.summary.operating_profit_margin), tone: 'bad' },
  ],
};

const increase = (label: string, from: number, to: number, tone: 'good' | 'bad' | 'neutral') => ({ label, value: Math.max(to - from, 0), display: dollars(to - from, true), tone });
export const digVisual: ScenarioVisual = {
  kind: 'bars',
  caption: `Change from ${beforeLabel} to ${afterLabel}, Nova Commerce demo data`,
  rows: [
    increase('Revenue', Number(a.summary.revenue), Number(b.summary.revenue), 'good'),
    increase('Gross profit', Number(a.summary.gross_profit), Number(b.summary.gross_profit), 'good'),
    increase('Employee costs', expense(a, 'employee_costs'), expense(b, 'employee_costs'), 'bad'),
    increase('Shipping', expense(a, 'shipping'), expense(b, 'shipping'), 'neutral'),
    increase('Advertising', expense(a, 'advertising'), expense(b, 'advertising'), 'neutral'),
  ],
};

export const explainVisual: ScenarioVisual = {
  kind: 'findings',
  items: [
    { title: 'Most of the margin drop is payroll timing, not weaker trading', evidence: `Employee costs ${dollars(facts.employeeCostIncrease, true)} in the week; gross margin held at ${facts.grossMarginBefore.toFixed(1)}% → ${facts.grossMarginAfter.toFixed(1)}%` },
    { title: 'Sales volume grew without extra advertising pressure', evidence: `Revenue ${facts.revenueChangePct >= 0 ? '+' : ''}${facts.revenueChangePct.toFixed(1)}% while advertising moved ${dollars(expense(b, 'advertising') - expense(a, 'advertising'), true)}` },
  ],
};

const baseline = examples.baseline;
const [reduceAds, raisePrices] = examples.previews;
export const simulateVisual: ScenarioVisual = {
  kind: 'table',
  caption: `Hypothetical weekly results, ${periodLabel(examples.period)}. Computed by the Simulation engine; the traffic and conversion assumptions are ours.`,
  columns: ['Scenario', 'Revenue', 'Operating profit', 'Operating margin'],
  rows: [
    { cells: ['Baseline (history)', exact(baseline.revenue), exact(baseline.operating_profit), pct(baseline.operating_profit_margin)] },
    { cells: [`${reduceAds.name} (assumes −8% visitors)`, exact(reduceAds.simulated.revenue), exact(reduceAds.simulated.operating_profit), pct(reduceAds.simulated.operating_profit_margin)] },
    { cells: [`${raisePrices.name} (assumes conversion −0.15 pp)`, exact(raisePrices.simulated.revenue), exact(raisePrices.simulated.operating_profit), pct(raisePrices.simulated.operating_profit_margin)] },
  ],
};

const signedPct = (value: string | null) => (value === null ? 'n/a' : `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`);
export const compareVisual: ScenarioVisual = {
  kind: 'table',
  caption: 'Both strategies against one shared baseline, computed by the A/B Arena',
  columns: ['', examples.arena.scenarios[0].name, examples.arena.scenarios[1].name],
  rows: [
    { cells: ['Operating profit', exact(examples.arena.scenarios[0].simulated.operating_profit), exact(examples.arena.scenarios[1].simulated.operating_profit)] },
    { cells: ['Profit change vs baseline', signedPct(examples.arena.scenarios[0].differences.profit_change_pct), signedPct(examples.arena.scenarios[1].differences.profit_change_pct)], highlight: true },
    { cells: ['Revenue change vs baseline', signedPct(examples.arena.scenarios[0].differences.revenue_change_pct), signedPct(examples.arena.scenarios[1].differences.revenue_change_pct)] },
  ],
};

const optimization = examples.optimization;
export const optimizeVisual: ScenarioVisual = {
  kind: 'table',
  caption: `Goal: +${optimization.target_profit_increase_pct}% operating profit (${exact(optimization.target_operating_profit)}). Limits: price up to +6%, discount up to 5%, no extra spend, margin at least 25%. ${optimization.feasible_candidate_count} of ${optimization.candidates_evaluated} tested candidates fit.`,
  columns: ['Strategy', 'Operating profit', 'Operating margin', 'Meets goal'],
  rows: optimization.recommendations.map((strategy, index) => ({
    cells: [`Price ${Number(strategy.parameters.selling_price_change_pct) >= 0 ? '+' : ''}${Number(strategy.parameters.selling_price_change_pct)}%, discount ${Number(strategy.parameters.discount_pct)}%`, exact(strategy.simulated.operating_profit), pct(strategy.simulated.operating_profit_margin), 'Yes'],
    highlight: index === 0,
  })),
};
