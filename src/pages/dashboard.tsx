import { AlertCircle, Banknote, CircleDollarSign, RefreshCw, TrendingUp, Wallet, Percent } from 'lucide-react';
import { useEffect } from 'react';
import { Analytics } from '../components/analytics';
import { ReportingFilterControl } from '../components/reporting-filter';
import { API_BASE_URL } from '../api/client';
import { KpiCard } from '../components/kpi-card';
import { Button } from '../components/ui/button';
import { useDashboard } from '../hooks/use-dashboard';

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function DashboardPage() {
  const { dashboard, connection, retry, filter, setFilter } = useDashboard();
  const loading = dashboard.status === 'loading' || connection.status === 'checking';
  const connectionLabel = { checking: 'Checking API connection', connected: 'API connected', disconnected: 'API disconnected' }[connection.status];
  useEffect(() => {
    if (dashboard.status === 'success' && window.location.hash === '#analytics') document.getElementById('analytics')?.scrollIntoView();
  }, [dashboard.status]);

  return <>
    <header className="page-header">
      <div><p className="eyebrow">RETAIL DECISION LAB</p><h1>Dashboard</h1><p className="muted">A snapshot of your business performance.</p></div>
      <Button variant="outline" onClick={retry} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{loading ? 'Loading…' : 'Refresh'}</Button>
    </header>
    <section className="connection-bar" aria-label="API connection">
      <span className={`connection-status ${connection.status}`} role="status"><span className="status-dot" aria-hidden="true" />{connectionLabel}</span>
      <code>{API_BASE_URL}</code>
    </section>
    {connection.status === 'disconnected' && <div className="notice error-notice" role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Health check failed</strong><p>{connection.message}</p></div></div>}
    <ReportingFilterControl filter={filter} onChange={setFilter} period={dashboard.status === 'success' ? dashboard.data.summary.reporting_period : undefined} />

    {dashboard.status === 'loading' && <section aria-busy="true" aria-label="Loading dashboard"><p role="status" className="loading-message">Loading dashboard from the API…</p><div className="kpi-grid">{Array.from({ length: 6 }, (_, index) => <div className="card loading-card" key={index} aria-hidden="true"><div className="placeholder label-placeholder" /><div className="placeholder value-placeholder" /></div>)}</div></section>}
    {dashboard.status === 'error' && <section className="card error-panel" role="alert"><AlertCircle size={24} aria-hidden="true" /><h2>Dashboard unavailable</h2><p className="muted">{dashboard.message}</p><Button onClick={retry} disabled={loading}><RefreshCw size={16} aria-hidden="true" />Retry connection</Button></section>}
    {dashboard.status === 'success' && (() => {
      const analytics = dashboard.data;
      const data = analytics.summary;
      const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.currency, minimumFractionDigits: 2 });
      const number = new Intl.NumberFormat('en-US');
      const amount = (value: string | null) => value === null ? 'Unavailable' : currency.format(Number(value));
      const percentage = (value: string | null) => value === null ? 'Unavailable' : `${number.format(Number(value))}%`;
      const empty = data.order_count === 0 && data.visitors === 0
        && [data.revenue, data.cogs, data.total_expenses, data.gross_profit, data.operating_profit].every((value) => value !== null && Number(value) === 0);
      return <>
        <div className="notice mock-notice"><span className="badge">Database demo</span><p>{data.data_source.description}</p></div>
        {!data.data_completeness.is_complete && <div className="notice mock-notice" role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Financial data is incomplete</strong><p>Some values may be incomplete. Metrics that cannot be calculated are shown as unavailable.</p>{data.data_completeness.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</div></div>}
        <div className="reporting-period"><h2>Business overview</h2><span className="muted small">{formatDate(data.reporting_period.start)} – {formatDate(data.reporting_period.end)}</span></div>
        <p className="muted small period-context">Store timezone: {analytics.store_timezone} · Today in store: {analytics.as_of_date}</p>
        {empty && <div className="notice" role="status"><p>No activity in this reporting period.</p></div>}
        <section className="kpi-grid" aria-label="Business metrics">
          <KpiCard label="Revenue" value={amount(data.revenue)} icon={CircleDollarSign} description="Net sales, excluding VAT" />
          <KpiCard label="Gross profit" value={amount(data.gross_profit)} icon={TrendingUp} description="Revenue less cost of goods sold" />
          <KpiCard label="Operating profit" value={amount(data.operating_profit)} icon={Wallet} description="After operating costs and advertising" />
          <KpiCard label="Operating expenses" value={amount(data.operating_expenses)} icon={Banknote} description="Excludes advertising" />
          <KpiCard label="Operating margin" value={percentage(data.operating_profit_margin)} icon={Percent} description="Operating profit ÷ revenue" />
          <KpiCard label="Conversion rate" value={percentage(data.conversion_rate)} icon={Percent} description="Sales orders ÷ visitors" />
        </section>
        <section className="card data-details" aria-label="Report details"><h2>Report details</h2><dl><div><dt>Currency</dt><dd>{data.currency}</dd></div><div><dt>Data source</dt><dd>PostgreSQL · synthetic data</dd></div><div><dt>Reporting period</dt><dd>{data.reporting_period.start} to {data.reporting_period.end}</dd></div><div><dt>Total orders</dt><dd>{number.format(data.order_count)}</dd></div><div><dt>Total visitors</dt><dd>{data.data_completeness.traffic_days < data.data_completeness.expected_traffic_days ? `${number.format(data.visitors)} recorded (incomplete)` : number.format(data.visitors)}</dd></div><div><dt>Cost of goods sold</dt><dd>{amount(data.cogs)}</dd></div><div><dt>Advertising expenditure</dt><dd>{amount(data.advertising_expenditure)}</dd></div><div><dt>Total expenses</dt><dd>{amount(data.total_expenses)}</dd></div><div><dt>Average order value</dt><dd>{amount(data.average_order_value)}</dd></div><div><dt>Gross margin</dt><dd>{percentage(data.gross_profit_margin)}</dd></div><div><dt>API service</dt><dd>{connection.status === 'connected' ? connection.health.service : 'Health check unavailable'}</dd></div></dl><p className="muted small">Revenue excludes VAT and includes recorded returns and customer shipping. Total expenses include operating expenses and advertising once. Operating profit is before income tax. All displayed metrics are calculated from stored synthetic transactions.</p></section>
        <Analytics data={analytics} />
      </>;
    })()}
    <footer className="page-footer">Phase 04 · Dashboard and business analytics</footer>
  </>;
}
