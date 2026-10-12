import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { AssistantResponse } from '../api/assistant';
import { SimulationLabPage } from '../pages/simulation-lab';
import { optimizationFixture } from '../test/optimization-fixture';

vi.mock('recharts', async (importOriginal) => ({ ...await importOriginal<typeof import('recharts')>(), ResponsiveContainer: () => null }));
afterEach(() => vi.restoreAllMocks());
function answer(): AssistantResponse {
  const optimization = optimizationFixture();
  return { message: 'These strategies reach the target under fixed assumptions.', metrics: optimization.baseline, optimization, tools_used: ['get_store_metrics', 'run_goal_optimization'] };
}
async function openAssistant() {
  vi.spyOn(api, 'financeBaseline').mockResolvedValue(optimizationFixture().baseline);
  const view = render(<SimulationLabPage initialMode="assistant" />);
  await screen.findByRole('heading', { name: 'Historical baseline' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask assistant' })).toBeEnabled());
  return view;
}
function ask(message = 'Increase my operating profit by 20% without increasing advertising costs.') {
  fireEvent.change(screen.getByLabelText('Your business goal'), { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask assistant' }));
}
describe('decision assistant workflow', () => {
  it('shows historical metrics and calculated strategies, then transfers exact inputs to Arena', async () => {
    const assistant = vi.spyOn(api, 'assistantChat').mockResolvedValue(answer());
    await openAssistant(); ask();
    const region = await screen.findByRole('region', { name: 'AI assistant response' });
    expect(within(region).getByText('Historical store metrics')).toBeInTheDocument();
    expect(within(region).getByText('Calculated hypothetical strategies')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Assistant strategy 1' })).toHaveTextContent('$30.00');
    expect(screen.getByRole('region', { name: 'Applied assistant optimization request' })).toHaveTextContent('No margin floor');
    expect(assistant.mock.calls[0][0]).toEqual({ message: 'Increase my operating profit by 20% without increasing advertising costs.', start_date: answer().optimization!.reporting_period.start, end_date: answer().optimization!.reporting_period.end });
    fireEvent.click(screen.getByRole('button', { name: 'Send to A/B Arena' }));
    const first = within(screen.getByRole('group', { name: 'Scenario 1 editor' })); const second = within(screen.getByRole('group', { name: 'Scenario 2 editor' }));
    expect(first.getByLabelText('Scenario name')).toHaveValue('Historical baseline');
    expect(second.getByLabelText('Selling price change (%)')).toHaveValue('10');
    expect(second.getByLabelText('Expected conversion rate (%)')).toHaveValue('');
    expect(screen.queryByRole('region', { name: 'AI assistant response' })).not.toBeInTheDocument();
  });
  it('preserves input after missing-key errors, supports retry, and validates an empty goal', async () => {
    const assistant = vi.spyOn(api, 'assistantChat').mockRejectedValueOnce(new Error('AI assistant is not configured.')).mockResolvedValueOnce(answer());
    await openAssistant(); fireEvent.click(screen.getByRole('button', { name: 'Ask assistant' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Describe your business goal.'); expect(assistant).not.toHaveBeenCalled();
    ask('Increase profit by 20%.');
    expect(await screen.findByText('AI assistant is not configured.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your business goal')).toHaveValue('Increase profit by 20%.');
    fireEvent.click(screen.getByRole('button', { name: 'Ask assistant' }));
    await screen.findByRole('region', { name: 'AI assistant response' }); expect(assistant).toHaveBeenCalledTimes(2);
  });
  it('shows clarifications without invented metrics or a transfer action', async () => {
    vi.spyOn(api, 'assistantChat').mockResolvedValue({ message: 'Please give an operating profit percentage target.', metrics: null, optimization: null, tools_used: [] });
    await openAssistant(); ask('Help improve my store.');
    expect(await screen.findByText('Please give an operating profit percentage target.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Assistant historical metrics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to A/B Arena' })).not.toBeInTheDocument();
  });
  it('cancels a pending request and ignores a late response after a reporting-period edit', async () => {
    let resolve!: (data: AssistantResponse) => void;
    const assistant = vi.spyOn(api, 'assistantChat').mockReturnValue(new Promise(done => { resolve = done; }));
    await openAssistant(); ask();
    expect(screen.getByRole('button', { name: 'Evaluating your goal…' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Baseline end date'), { target: { value: '2026-09-02' } });
    expect(assistant.mock.calls[0][1]?.aborted).toBe(true);
    await act(async () => resolve(answer()));
    expect(screen.queryByRole('region', { name: 'AI assistant response' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask assistant' })).toBeDisabled();
  });
  it('clears completed results on a goal edit and cancels pending requests on unmount', async () => {
    const assistant = vi.spyOn(api, 'assistantChat').mockResolvedValueOnce(answer()).mockReturnValueOnce(new Promise(() => {}));
    const view = await openAssistant(); ask(); await screen.findByRole('region', { name: 'AI assistant response' });
    fireEvent.change(screen.getByLabelText('Your business goal'), { target: { value: 'Increase profit by 30%.' } });
    expect(screen.queryByRole('region', { name: 'AI assistant response' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask assistant' })); view.unmount();
    expect(assistant.mock.calls[1][1]?.aborted).toBe(true);
  });
  it('rejects results from a different period before updating metrics or exposing transfer', async () => {
    const response = answer(); response.metrics = { ...response.metrics!, reporting_period: { start: '2026-08-01', end: '2026-08-31' } };
    vi.spyOn(api, 'assistantChat').mockResolvedValue(response);
    await openAssistant(); ask();
    expect(await screen.findByText('The assistant returned results for a different reporting period. Please retry.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to A/B Arena' })).not.toBeInTheDocument();
  });
});
