import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { SimulationLabPage } from '../pages/simulation-lab';
import { comparisonFixture } from '../test/comparison-fixture';

vi.mock('recharts', async (importOriginal) => ({ ...await importOriginal<typeof import('recharts')>(), ResponsiveContainer: () => null }));
afterEach(() => vi.restoreAllMocks());
async function openArena() {
  render(<SimulationLabPage />);
  await screen.findByRole('heading', { name: 'Historical baseline' });
  fireEvent.click(screen.getByRole('button', { name: 'A/B Arena' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Compare scenarios' })).toBeEnabled());
}
const editor = (index: number) => within(screen.getByRole('group', { name: `Scenario ${index} editor` }));

describe('Simulation A/B Arena', () => {
  it('edits, duplicates, adds up to four, removes, compares and manually evaluates named scenarios', async () => {
    const fixture = comparisonFixture();
    vi.spyOn(api, 'financeBaseline').mockResolvedValue(fixture.baseline);
    const compare = vi.spyOn(api, 'simulationCompare').mockImplementation(async (request) => comparisonFixture(request));
    await openArena();
    expect(editor(1).getByRole('button', { name: 'Remove scenario' })).toBeDisabled();
    fireEvent.change(editor(1).getByLabelText('Scenario name'), { target: { value: '  Lower discount  ' } });
    fireEvent.change(editor(1).getByLabelText('Additional discount (%)'), { target: { value: '5' } });
    fireEvent.click(editor(1).getByRole('button', { name: 'Duplicate scenario' }));
    expect(editor(3).getByLabelText('Additional discount (%)')).toHaveValue('5');
    fireEvent.click(screen.getByRole('button', { name: 'Add scenario' }));
    expect(screen.getByRole('button', { name: 'Add scenario' })).toBeDisabled();
    expect(editor(1).getByRole('button', { name: 'Duplicate scenario' })).toBeDisabled();
    fireEvent.click(editor(4).getByRole('button', { name: 'Remove scenario' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare scenarios' }));
    await screen.findByRole('heading', { name: 'Shared-baseline comparison' });
    const submitted = compare.mock.calls[0][0];
    expect(submitted.scenarios).toHaveLength(3);
    expect(new Set(submitted.scenarios.map(({ id }) => id)).size).toBe(3);
    expect(submitted.scenarios[0]).toMatchObject({ name: 'Lower discount', parameters: { discount_pct: '5', expected_conversion_rate: null } });
    expect(submitted.scenarios[2].name).toBe('Lower discount (copy)');
    expect(screen.getByRole('table', { name: 'Scenario financial comparison' })).toHaveTextContent('-$20.00');
    expect(screen.getByText('No scenario selected.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Select Lower discount', { exact: true }));
    expect(screen.getByText('Your selection: Lower discount. Review the assumptions before making a business decision.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Exclude Lower discount from consideration'));
    expect(screen.getByLabelText('Select Lower discount', { exact: true })).toBeDisabled();
    expect(screen.getByText('No scenario selected.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Scenario financial comparison' })).toHaveTextContent('Excluded by you');
    fireEvent.change(editor(2).getByLabelText('Scenario name'), { target: { value: 'New assumption' } });
    expect(screen.queryByRole('region', { name: 'Scenario comparison results' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset comparison' }));
    expect(screen.getAllByRole('group', { name: /Scenario \d editor/ })).toHaveLength(2);
    expect(editor(1).getByLabelText('Additional discount (%)')).toHaveValue('0');
    expect(editor(1).getByLabelText('Scenario name')).toHaveValue('Scenario A');
  });

  it('blocks invalid parameters and clears results when the reporting period changes', async () => {
    const fixture = comparisonFixture();
    vi.spyOn(api, 'financeBaseline').mockResolvedValue(fixture.baseline);
    const compare = vi.spyOn(api, 'simulationCompare').mockImplementation(async (request) => comparisonFixture(request));
    await openArena();
    fireEvent.change(editor(2).getByLabelText('Expected conversion rate (%)'), { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare scenarios' }));
    expect(await screen.findByText('Enter a value from 0 to 100.')).toBeInTheDocument();
    expect(compare).not.toHaveBeenCalled();
    fireEvent.change(editor(2).getByLabelText('Expected conversion rate (%)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare scenarios' }));
    await screen.findByRole('heading', { name: 'Shared-baseline comparison' });
    fireEvent.change(screen.getByLabelText('Baseline end date'), { target: { value: '2026-09-02' } });
    expect(screen.queryByRole('region', { name: 'Scenario comparison results' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare scenarios' })).toBeDisabled();
  });

  it('discloses unavailable scenario warnings and allows retry after an error', async () => {
    const fixture = comparisonFixture();
    vi.spyOn(api, 'financeBaseline').mockResolvedValue(fixture.baseline);
    vi.spyOn(api, 'simulationCompare').mockRejectedValueOnce(new Error('A scenario has a negative advertising budget.')).mockImplementationOnce(async (request) => {
      const response = comparisonFixture(request);
      return { ...response, warnings: ['Historical data is incomplete.'], scenarios: response.scenarios.map((scenario) => ({ ...scenario, status: 'unavailable' as const, simulated: null, differences: null, comparison: null, warnings: ['Required traffic is missing.'] })) };
    });
    await openArena();
    fireEvent.click(screen.getByRole('button', { name: 'Compare scenarios' }));
    expect(await screen.findByText('A scenario has a negative advertising budget.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare scenarios' }));
    await screen.findByRole('heading', { name: 'Shared-baseline comparison' });
    expect(screen.getByText('Historical data is incomplete.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Scenario financial comparison' })).toHaveTextContent('Unavailable');
    expect(screen.getByLabelText('Select Scenario A')).toBeDisabled();
    expect(screen.queryByRole('region', { name: 'Arena revenue and profit chart' })).not.toBeInTheDocument();
  });
});
