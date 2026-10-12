import { motion } from 'motion/react';
import type { AnalyticsDashboard } from '@/api/schemas';
import type { Formatters } from '@/lib/format';
import { cn } from '@/shared/lib/utils';
import { dailySeries, metrics, type MetricDef, type MetricId } from './metrics';
import { Sparkline } from './ui';

interface KpiOverviewProps {
  data: AnalyticsDashboard;
  format: Formatters;
  activeMetricId: MetricId;
  onSelectMetric: (id: MetricId) => void;
}

const cardClass = 'group flex h-full w-full flex-col gap-4 rounded-2xl border bg-card p-5 text-left text-card-foreground shadow-soft backdrop-blur-xl';

/** KPI cards. Selecting a card that has a daily series chooses the metric shown in the performance chart. */
export function KpiOverview({ data, format, activeMetricId, onSelectMetric }: KpiOverviewProps) {
  const summary = data.summary;
  return (
    <section aria-label="Business metrics">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric, index) => {
          const raw = summary[metric.summaryKey];
          const value = metric.format === 'currency' ? format.amount(raw) : format.percentage(raw);
          const selectable = metric.dailyKey !== undefined;
          const active = selectable && metric.id === activeMetricId;
          return (
            <motion.li key={metric.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }}>
              <article aria-label={metric.label} className="h-full">
                {selectable ? (
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectMetric(metric.id)}
                    className={cn(cardClass, 'transition-[transform,box-shadow,border-color] duration-(--duration-base) ease-(--ease-soft) outline-none hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-[3px] focus-visible:ring-ring/40', active ? 'border-ring' : 'border-border')}
                  >
                    <KpiFace metric={metric} value={value} unavailable={raw === null} active={active} series={dailySeries(data.daily, metric)} />
                    <span className="sr-only">{active ? 'Shown in the performance chart.' : 'Show in the performance chart.'}</span>
                  </button>
                ) : (
                  <div className={cn(cardClass, 'border-border')}>
                    <KpiFace metric={metric} value={value} unavailable={raw === null} active={false} />
                  </div>
                )}
              </article>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

function KpiFace({ metric, value, unavailable, active, series }: { metric: MetricDef; value: string; unavailable: boolean; active: boolean; series?: (number | null)[] }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-(--duration-base)', active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary')}>
          <metric.icon className="size-[18px]" aria-hidden />
        </span>
        <span className="truncate text-sm font-medium text-muted-foreground">{metric.label}</span>
      </span>
      <span className="flex flex-col gap-1.5">
        <motion.span key={value} initial={{ opacity: 0.3, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={cn('kpi-value font-display text-3xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]', unavailable && 'text-muted-foreground')}>
          {value}
        </motion.span>
        <span className="text-xs text-muted-foreground">{metric.description}</span>
      </span>
      {series ? <Sparkline data={series} /> : <span className="h-8" aria-hidden />}
    </>
  );
}
