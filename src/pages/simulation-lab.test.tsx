import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { simulationFixture } from '../test/simulation-fixture';
import { SimulationLabPage } from './simulation-lab';

vi.mock('recharts', async (importOriginal) => ({ ...await importOriginal<typeof import('recharts')>(), ResponsiveContainer: () => null }));
afterEach(() => vi.restoreAllMocks());

describe('Simulation Lab form', () => {
  it('submits typed inputs against the loaded period and clears results when assumptions change', async () => {
    const fixture = simulationFixture();
    vi.spyOn(api, 'financeBaseline').mockResolvedValue(fixture.baseline);
    const preview = vi.spyOn(api, 'simulationPreview').mockImplementation(async (request) => ({ ...fixture, parameters: request.parameters }));
    render(<SimulationLabPage />);
    await screen.findByRole('heading', { name: 'Historical baseline' });
    await waitFor(() => expect(screen.getByLabelText('Baseline start date')).toHaveValue('2026-09-01'));
    expect(screen.getByLabelText('Expected conversion rate (%)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Additional discount (%)'), { target: { value: '10.125' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }));
    await screen.findByRole('heading', { name: 'Hypothetical results' });
    expect(preview.mock.calls[0][0]).toMatchObject({ start_date: '2026-09-01', end_date: '2026-09-01', parameters: { discount_pct: '10.125', expected_conversion_rate: null } });
    const table = screen.getByRole('table', { name: 'Historical and hypothetical comparison' });
    expect(within(table).getByText('exact historical ratio', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('10.125%')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Expected conversion rate (%)'), { target: { value: '2.5' } });
    expect(screen.queryByRole('region', { name: 'Simulation results' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }));
    await screen.findByRole('heading', { name: 'Hypothetical results' });
    expect(preview.mock.calls[1][0].parameters.expected_conversion_rate).toBe('2.5');
  });

  it('blocks invalid values and prevents a run against an unloaded date selection', async () => {
    const fixture = simulationFixture();
    vi.spyOn(api, 'financeBaseline').mockResolvedValue(fixture.baseline);
    const preview = vi.spyOn(api, 'simulationPreview');
    render(<SimulationLabPage />);
    await screen.findByRole('heading', { name: 'Historical baseline' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run simulation' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Expected conversion rate (%)'), { target: { value: '101' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }));
    expect(await screen.findByText('Enter a value from 0 to 100.')).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Baseline end date'), { target: { value: '2026-09-02' } });
    expect(screen.getByRole('button', { name: 'Run simulation' })).toBeDisabled();
    expect(screen.getByText('Load this reporting period before running a simulation.')).toBeInTheDocument();
  });

  it('shows missing baseline metrics and server warnings without substituting zero', async () => {
    const fixture = simulationFixture();
    const baseline = { ...fixture.baseline, revenue: null, operating_profit: null, data_completeness: { ...fixture.baseline.data_completeness, is_complete: false, missing_vat_lines: 1, warnings: ['Historical VAT semantics are unknown.'] } };
    vi.spyOn(api, 'financeBaseline').mockResolvedValue(baseline);
    vi.spyOn(api, 'simulationPreview').mockResolvedValue({ ...fixture, baseline, status: 'unavailable', simulated: null, differences: null, warnings: ['Complete historical financial data is required.'] });
    render(<SimulationLabPage />);
    await screen.findByRole('heading', { name: 'Historical baseline' });
    expect(within(screen.getByRole('article', { name: 'Baseline revenue' })).getByText('Unavailable')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run simulation' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }));
    await screen.findByRole('heading', { name: 'Simulation unavailable' });
    expect(screen.getByText('Complete historical financial data is required.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Historical and hypothetical comparison' })).not.toBeInTheDocument();
  });
});
