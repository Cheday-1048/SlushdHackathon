import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { OptimizationResponse } from '../api/optimization';
import { SimulationLabPage } from '../pages/simulation-lab';
import { comparisonFixture } from '../test/comparison-fixture';
import { optimizationFixture } from '../test/optimization-fixture';
vi.mock('recharts', async (importOriginal) => ({ ...await importOriginal<typeof import('recharts')>(), ResponsiveContainer: () => null }));
afterEach(() => vi.restoreAllMocks());
async function openOptimizer() {
  vi.spyOn(api, 'financeBaseline').mockResolvedValue(optimizationFixture().baseline);
  render(<SimulationLabPage />); await screen.findByRole('heading', { name: 'Historical baseline' });
  fireEvent.click(screen.getByRole('button', { name: 'Goal Optimizer' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Find Strategies' })).toBeEnabled());
}
describe('goal optimization workflow', () => {
  it('finds strategies with fixed historical assumptions and transfers the chosen strategy to Arena', async () => {
    const optimize = vi.spyOn(api, 'optimizeGoal').mockImplementation(async request => optimizationFixture(request));
    const compare = vi.spyOn(api, 'simulationCompare').mockImplementation(async request => comparisonFixture(request));
    await openOptimizer(); fireEvent.click(screen.getByRole('button', { name: 'Find Strategies' }));
    await screen.findByRole('heading', { name: 'Recommended strategies' });
    const request = optimize.mock.calls[0][0]; expect(request.behavioral_assumptions).toEqual({ conversion_mode: 'historical', expected_conversion_rate: null, visitor_change_pct: '0', unit_cost_change_pct: '0' });
    expect(screen.getByRole('region', { name: 'Goal optimization results' })).toHaveTextContent('15 candidates evaluated');
    expect(screen.getByRole('article', { name: 'Recommended strategy 1' })).toHaveTextContent('$30.00');
    fireEvent.click(screen.getByRole('button', { name: 'Send to A/B Arena' }));
    const first = within(screen.getByRole('group', { name: 'Scenario 1 editor' })); const second = within(screen.getByRole('group', { name: 'Scenario 2 editor' }));
    expect(first.getByLabelText('Scenario name')).toHaveValue('Historical baseline'); expect(second.getByLabelText('Selling price change (%)')).toHaveValue('10');
    expect(second.getByLabelText('Expected conversion rate (%)')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Compare scenarios' })); await screen.findByRole('heading', { name: 'Shared-baseline comparison' });
    expect(compare.mock.calls[0][0].start_date).toBe(request.start_date); expect(compare.mock.calls[0][0].end_date).toBe(request.end_date);
    expect(new Set(compare.mock.calls[0][0].scenarios.map(s => s.id)).size).toBe(2);
  });
  it('validates goal constraints and explicit conversion; edits clear completed results', async () => {
    const optimize = vi.spyOn(api, 'optimizeGoal').mockImplementation(async request => optimizationFixture(request));
    await openOptimizer();
    fireEvent.change(screen.getByLabelText('Minimum selling price change (%)'), { target: { value: '11' } }); fireEvent.click(screen.getByRole('button', { name: 'Find Strategies' }));
    expect(await screen.findByText('Maximum selling price change must be at least the minimum.')).toBeInTheDocument(); expect(optimize).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Minimum selling price change (%)'), { target: { value: '0' } }); fireEvent.change(screen.getByLabelText('Conversion assumption'), { target: { value: 'explicit' } }); fireEvent.click(screen.getByRole('button', { name: 'Find Strategies' }));
    expect(await screen.findByText('Enter your explicit conversion assumption.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Assumed conversion rate (%)'), { target: { value: '4.0001' } }); fireEvent.change(screen.getByLabelText('Assumed visitor change (%)'), { target: { value: '10' } }); fireEvent.click(screen.getByRole('button', { name: 'Find Strategies' }));
    await screen.findByRole('heading', { name: 'Recommended strategies' }); expect(optimize.mock.calls[0][0].behavioral_assumptions).toMatchObject({ conversion_mode: 'explicit', expected_conversion_rate: '4.0001', visitor_change_pct: '10' });
    fireEvent.change(screen.getByLabelText('Maximum discount (%)'), { target: { value: '5' } }); expect(screen.queryByRole('region', { name: 'Goal optimization results' })).not.toBeInTheDocument();
  });
  it('explains unachievable and unsupported results and retries request failures', async () => {
    const response = optimizationFixture();
    vi.spyOn(api, 'optimizeGoal').mockRejectedValueOnce(new Error('API unavailable.')).mockResolvedValueOnce({ ...response, status: 'target_not_achievable', recommendations: [], feasible_candidate_count: 0 }).mockResolvedValueOnce({ ...response, status: 'unavailable', recommendations: [], feasible_candidate_count: 0, candidates_evaluated: 0, target_operating_profit: null, target_profit_difference: null, warnings: ['Percentage goals require positive baseline profit.'] });
    await openOptimizer(); fireEvent.click(screen.getByRole('button', { name: 'Find Strategies' })); expect(await screen.findByText('API unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Find Strategies' })); await screen.findByRole('heading', { name: 'Target not achievable under current assumptions' }); expect(screen.queryByRole('button', { name: 'Send to A/B Arena' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Find Strategies' })); await screen.findByRole('heading', { name: 'Optimization unavailable' }); expect(screen.getByText('Percentage goals require positive baseline profit.')).toBeInTheDocument();
  });
  it('aborts a pending result when dates are edited and ignores the late response', async () => {
    let resolve!: (value: OptimizationResponse) => void;
    const optimize = vi.spyOn(api, 'optimizeGoal').mockReturnValue(new Promise(done => { resolve = done; }));
    await openOptimizer(); fireEvent.click(screen.getByRole('button', { name: 'Find Strategies' })); await screen.findByText('Evaluating a bounded set of strategies from one shared baseline…');
    fireEvent.change(screen.getByLabelText('Baseline end date'), { target: { value: '2026-09-02' } }); expect(optimize.mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => resolve(optimizationFixture())); expect(screen.queryByRole('region', { name: 'Goal optimization results' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Find Strategies' })).toBeDisabled();
  });
});
