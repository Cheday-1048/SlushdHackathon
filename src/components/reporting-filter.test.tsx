import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportingFilterControl } from './reporting-filter';

describe('reporting filter form', () => {
  it('keeps filters available before a report loads and applies presets immediately', () => {
    const change = vi.fn();
    render(<ReportingFilterControl filter={{ preset: 'demo' }} onChange={change} />);
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'last_30_days' } });
    expect(change).toHaveBeenCalledWith({ preset: 'last_30_days' });
  });

  it('validates custom dates before submitting and retains the previous report until Apply', () => {
    const change = vi.fn();
    render(<ReportingFilterControl filter={{ preset: 'demo' }} onChange={change} period={{ start: '2026-09-01', end: '2026-09-30' }} />);
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'custom' } });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-09-01');
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after start date.');
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-09-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(change).toHaveBeenCalledWith({ preset: 'custom', start_date: '2026-09-01', end_date: '2026-09-02' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports missing dates without sending an invalid request', () => {
    const change = vi.fn();
    render(<ReportingFilterControl filter={{ preset: 'demo' }} onChange={change} />);
    fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose both a start and end date.');
    expect(change).not.toHaveBeenCalled();
  });
});
