import { useState } from 'react';
import { reportingFilterSchema, type ReportingFilter } from '../api/schemas';
import { Button } from './ui/button';

export function ReportingFilterControl({ filter, onChange, period }: {
  filter: ReportingFilter;
  onChange: (filter: ReportingFilter) => void;
  period?: { start: string; end: string };
}) {
  const [selection, setSelection] = useState<ReportingFilter['preset']>(filter.preset);
  const [start, setStart] = useState(filter.preset === 'custom' ? filter.start_date : '');
  const [end, setEnd] = useState(filter.preset === 'custom' ? filter.end_date : '');
  const [error, setError] = useState<string | null>(null);

  return <form className="card reporting-filter" aria-label="Reporting filters" noValidate onSubmit={(event) => {
    event.preventDefault();
    const parsed = reportingFilterSchema.safeParse({ preset: 'custom', start_date: start, end_date: end });
    if (!parsed.success) {
      setError(!start || !end ? 'Choose both a start and end date.' : parsed.error.issues[0].message);
      return;
    }
    setError(null);
    onChange(parsed.data);
  }}>
    <div className="filter-fields">
      <label>Reporting period<select value={selection} onChange={(event) => {
        const preset = event.target.value as ReportingFilter['preset'];
        setSelection(preset);
        setError(null);
        if (preset === 'custom') {
          setStart(period?.start ?? '');
          setEnd(period?.end ?? '');
        } else onChange({ preset });
      }}>
        <option value="demo">Sample period</option>
        <option value="last_7_days">Last 7 days</option>
        <option value="last_30_days">Last 30 days</option>
        <option value="last_90_days">Last 90 days</option>
        <option value="custom">Custom range</option>
      </select></label>
      {selection === 'custom' && <>
        <label>Start date<input type="date" value={start} onChange={(event) => setStart(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'reporting-filter-error' : undefined} /></label>
        <label>End date<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? 'reporting-filter-error' : undefined} /></label>
        <Button type="submit">Apply range</Button>
      </>}
    </div>
    <p className="muted small">Presets include today in the store’s timezone. The sample period shows the stored demo dates. Custom ranges include both dates, up to 366 days.</p>
    {error && <p id="reporting-filter-error" className="filter-error" role="alert">{error}</p>}
  </form>;
}
