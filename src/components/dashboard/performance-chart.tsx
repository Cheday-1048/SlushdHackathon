import { LineChart } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsDashboard } from '@/api/schemas';
import { useTheme } from '@/design-system/theme-context';
import type { Formatters } from '@/lib/format';
import { NativeSelect } from '@/shared/components/ui/native-select';
import { chartMetrics, dailySeries, type MetricDef, type MetricId } from './metrics';
import { EmptyState, WidgetCard } from './ui';

interface ChartRow { date: string; label: string; value: number | null }

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };
const compact = new Intl.NumberFormat('en-US', { notation: 'compact' });

function ChartTooltip({ active, payload, format }: { active?: boolean; payload?: readonly { payload?: unknown }[]; format: (value: number) => string }) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3.5 py-2.5 text-sm shadow-lift">
      <p className="font-medium">{row.date}</p>
      <p className="mt-1 flex items-center gap-2"><span className="size-2 rounded-full bg-primary" aria-hidden />{row.value === null ? 'Unavailable' : <span className="font-semibold tabular-nums">{format(row.value)}</span>}</p>
    </div>
  );
}

/** Main chart: the selected KPI's daily API series. Days without a known value are gaps. */
export function PerformanceChart({ data, format, metric, onMetricChange }: { data: AnalyticsDashboard; format: Formatters; metric: MetricDef; onMetricChange: (id: MetricId) => void }) {
  const reduced = useReducedMotion();
  const { motionPreference } = useTheme();
  const animate = !reduced && motionPreference === 'system';
  const series = dailySeries(data.daily, metric);
  const rows: ChartRow[] = data.daily.map((day, index) => ({ date: day.date, label: day.date.slice(5), value: series[index] }));
  const hasValues = series.some((value) => value !== null);
  const { start, end } = data.summary.reporting_period;
  const formatValue = (value: number) => (metric.format === 'currency' ? format.currency.format(value) : `${format.number.format(value)}%`);
  const tick = (value: number) => (metric.format === 'currency' ? compact.format(value) : `${value}%`);
  const isolated = (index: number) => rows[index]?.value != null && rows[index - 1]?.value == null && rows[index + 1]?.value == null;

  return (
    <WidgetCard
      index={1}
      title="Performance"
      description={`${metric.label} per day · ${start} to ${end}${metric.format === 'currency' ? ` · ${data.summary.currency}` : ''}`}
      actions={
        <NativeSelect aria-label="Metric" value={metric.id} onChange={(event) => onMetricChange(event.target.value as MetricId)} wrapperClassName="w-44" className="h-8 rounded-lg text-xs">
          {chartMetrics.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </NativeSelect>
      }
    >
      {!hasValues ? (
        <EmptyState icon={LineChart} title="No values to chart" description="The API has no recorded values for this metric in the selected period." />
      ) : (
        <div className="h-72 w-full" role="img" aria-label={`${metric.label} per day from ${start} to ${end}. Exact values are in the daily analytics data table below.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 20, left: 4 }}>
              <defs>
                <linearGradient id="performance-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={24} label={{ value: 'Date (MM-DD)', position: 'insideBottom', offset: -12, fill: 'var(--muted-foreground)', fontSize: 12 }} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={metric.format === 'currency' ? 52 : 56} domain={['auto', 'auto']} tickFormatter={tick} />
              <Tooltip content={(props) => <ChartTooltip active={props.active} payload={props.payload} format={formatValue} />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#performance-fill)"
                connectNulls={false}
                dot={(props: { cx?: number; cy?: number; index?: number }) => props.index !== undefined && isolated(props.index) ? <circle key={`dot-${props.index}`} className="recharts-dot" cx={props.cx} cy={props.cy} r={3} fill="var(--primary)" /> : <g key={`dot-${props.index}`} />}
                activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2 }}
                isAnimationActive={animate}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </WidgetCard>
  );
}
