import type { AnalyticsDashboard } from '@/api/schemas';
import type { Formatters } from '@/lib/format';
import type { ConnectionState } from '@/hooks/use-dashboard';
import { Card } from '@/shared/components/ui/card';

/** The complete report summary exactly as calculated by the API. */
export function ReportDetails({ data, format, connection }: { data: AnalyticsDashboard; format: Formatters; connection: ConnectionState }) {
  const summary = data.summary;
  const incompleteTraffic = summary.data_completeness.traffic_days < summary.data_completeness.expected_traffic_days;
  const items: [string, string][] = [
    ['Currency', summary.currency],
    ['Data source', connection.status === 'demo' ? 'Bundled demo dataset · synthetic data' : 'PostgreSQL · synthetic data'],
    ['Reporting period', `${summary.reporting_period.start} to ${summary.reporting_period.end}`],
    ['Total orders', format.number.format(summary.order_count)],
    ['Total visitors', incompleteTraffic ? `${format.number.format(summary.visitors)} recorded (incomplete)` : format.number.format(summary.visitors)],
    ['Cost of goods sold', format.amount(summary.cogs)],
    ['Advertising expenditure', format.amount(summary.advertising_expenditure)],
    ['Total expenses', format.amount(summary.total_expenses)],
    ['Average order value', format.amount(summary.average_order_value)],
    ['Gross margin', format.percentage(summary.gross_profit_margin)],
    ['API service', connection.status === 'connected' ? connection.health.service : connection.status === 'demo' ? 'Demo Mode (no backend)' : 'Health check unavailable'],
  ];
  return (
    <section aria-label="Report details">
      <Card className="gap-5 p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Report details</h2>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">Revenue excludes VAT and includes recorded returns and customer shipping. Total expenses include operating expenses and advertising once. Operating profit is before income tax. All displayed metrics are calculated from stored synthetic transactions.</p>
      </Card>
    </section>
  );
}
