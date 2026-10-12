import { AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Analytics } from '../components/analytics';
import { ReportingFilterControl } from '../components/reporting-filter';
import { API_BASE_URL } from '../api/client';
import { business } from '../demo/aggregate';
import { KpiOverview } from '../components/dashboard/kpi-overview';
import { chartMetrics, type MetricId } from '../components/dashboard/metrics';
import { PerformanceChart } from '../components/dashboard/performance-chart';
import { ReportDetails } from '../components/dashboard/report-details';
import { Notice, Skeleton } from '../components/dashboard/ui';
import { brand } from '@/design-system/brand';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { createFormatters, formatDate } from '@/lib/format';
import { useDashboard } from '../hooks/use-dashboard';

export function DashboardPage() {
  const { dashboard, connection, retry, filter, setFilter } = useDashboard();
  const [metricId, setMetricId] = useState<MetricId>('revenue');
  const loading = dashboard.status === 'loading' || connection.status === 'checking';
  const demo = connection.status === 'demo';
  const connectionLabel = { demo: 'Demo Mode · Synthetic Data', checking: 'Checking API connection', connected: 'API connected', disconnected: 'API disconnected' }[connection.status];
  useEffect(() => {
    if (dashboard.status === 'success' && window.location.hash === '#analytics') document.getElementById('analytics')?.scrollIntoView();
  }, [dashboard.status]);

  const success = dashboard.status === 'success' ? dashboard.data : null;
  const period = success?.summary.reporting_period;

  return <>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{brand.name}</p>
        <h2 className="mt-1 text-3xl font-semibold">Business overview</h2>
        <p className="mt-1 text-muted-foreground">{period ? `${formatDate(period.start)} – ${formatDate(period.end)}` : 'A snapshot of your business performance.'}</p>
        {success && <p className="mt-1 text-xs text-muted-foreground">Store timezone: {success.store_timezone} · Today in store: {success.as_of_date}</p>}
      </div>
      <Button variant="outline" onClick={retry} disabled={loading}><RefreshCw className={cn(loading && 'animate-spin')} aria-hidden="true" />{loading ? 'Loading…' : 'Refresh'}</Button>
    </header>

    <section aria-label="API connection" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft backdrop-blur-xl">
      <span role="status" className="inline-flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className={cn('size-2 rounded-full', (connection.status === 'connected' || demo) && 'bg-success', connection.status === 'checking' && 'animate-pulse bg-warning', connection.status === 'disconnected' && 'bg-destructive')} />{connectionLabel}
      </span>
      {demo
        ? <span className="text-xs text-muted-foreground">{business.name} · {business.industry} · September 2026 · bundled sample data, no backend</span>
        : <code className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{API_BASE_URL}</code>}
    </section>
    {connection.status === 'disconnected' && <Notice tone="error" role="alert"><strong className="font-semibold">Health check failed</strong><p className="text-muted-foreground">{connection.message}</p></Notice>}

    <ReportingFilterControl filter={filter} onChange={setFilter} period={period} />

    {dashboard.status === 'loading' && <section aria-busy="true" aria-label="Loading dashboard" className="flex flex-col gap-4">
      <p role="status" className="text-sm text-muted-foreground">Loading dashboard from the API…</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Card key={index} aria-hidden="true" className="min-h-40 gap-4 p-5"><div className="flex items-center gap-3"><Skeleton className="size-9 rounded-xl" /><Skeleton className="h-4 w-1/2" /></div><Skeleton className="h-8 w-3/4" /><Skeleton className="h-8 w-full" /></Card>)}</div>
      <Card aria-hidden="true" className="gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-64 w-full" /></Card>
    </section>}
    {dashboard.status === 'error' && <motion.section role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-start gap-3 rounded-2xl border border-destructive/40 bg-card p-6 shadow-soft backdrop-blur-xl">
      <span className="grid size-11 place-items-center rounded-full bg-destructive/12 text-destructive"><AlertCircle size={22} aria-hidden="true" /></span>
      <h2 className="text-lg font-semibold">Dashboard unavailable</h2>
      <p className="text-muted-foreground">{dashboard.message}</p>
      <Button onClick={retry} disabled={loading}><RefreshCw aria-hidden="true" />Retry connection</Button>
    </motion.section>}
    {success && (() => {
      const data = success.summary;
      const format = createFormatters(data.currency);
      const empty = data.order_count === 0 && data.visitors === 0
        && [data.revenue, data.cogs, data.total_expenses, data.gross_profit, data.operating_profit].every((value) => value !== null && Number(value) === 0);
      const metric = chartMetrics.find((item) => item.id === metricId) ?? chartMetrics[0];
      return <>
        <Notice><div className="flex flex-wrap items-center gap-2"><Badge>{demo ? 'Demo dataset' : 'Database demo'}</Badge><p>{data.data_source.description}</p></div></Notice>
        {!data.data_completeness.is_complete && <Notice tone="warning" role="alert"><strong className="font-semibold">Financial data is incomplete</strong><p>Some values may be incomplete. Metrics that cannot be calculated are shown as unavailable.</p>{data.data_completeness.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</Notice>}
        {empty && <Notice role="status"><p>No activity in this reporting period.</p></Notice>}
        <KpiOverview data={success} format={format} activeMetricId={metric.id} onSelectMetric={setMetricId} />
        <PerformanceChart data={success} format={format} metric={metric} onMetricChange={setMetricId} />
        <ReportDetails data={success} format={format} connection={connection} />
        <Analytics data={success} />
      </>;
    })()}
    <footer className="pb-2 text-xs text-muted-foreground">Dashboard and business analytics</footer>
  </>;
}
