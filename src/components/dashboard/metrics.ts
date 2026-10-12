import { Banknote, CircleDollarSign, Percent, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import type { AnalyticsDashboard } from '@/api/schemas';

export type DailyRow = AnalyticsDashboard['daily'][number];
export type MetricId = 'revenue' | 'gross_profit' | 'operating_profit' | 'operating_expenses' | 'operating_margin' | 'conversion_rate';

export interface MetricDef {
  id: MetricId;
  label: string;
  description: string;
  icon: LucideIcon;
  format: 'currency' | 'percent';
  /** Field of the API summary that holds this KPI. */
  summaryKey: 'revenue' | 'gross_profit' | 'operating_profit' | 'operating_expenses' | 'operating_profit_margin' | 'conversion_rate';
  /** Daily API series behind the KPI. Absent when the API does not provide one (it is never derived here). */
  dailyKey?: 'revenue' | 'gross_profit' | 'operating_profit' | 'operating_expenses' | 'conversion_rate';
}

/** KPI definitions. Values come from the API summary; the chart reads the matching daily series. */
export const metrics: readonly MetricDef[] = [
  { id: 'revenue', label: 'Revenue', description: 'Net sales, excluding VAT', icon: CircleDollarSign, format: 'currency', summaryKey: 'revenue', dailyKey: 'revenue' },
  { id: 'gross_profit', label: 'Gross profit', description: 'Revenue less cost of goods sold', icon: TrendingUp, format: 'currency', summaryKey: 'gross_profit', dailyKey: 'gross_profit' },
  { id: 'operating_profit', label: 'Operating profit', description: 'After operating costs and advertising', icon: Wallet, format: 'currency', summaryKey: 'operating_profit', dailyKey: 'operating_profit' },
  { id: 'operating_expenses', label: 'Operating expenses', description: 'Excludes advertising', icon: Banknote, format: 'currency', summaryKey: 'operating_expenses', dailyKey: 'operating_expenses' },
  { id: 'operating_margin', label: 'Operating margin', description: 'Operating profit ÷ revenue', icon: Percent, format: 'percent', summaryKey: 'operating_profit_margin' },
  { id: 'conversion_rate', label: 'Conversion rate', description: 'Sales orders ÷ visitors', icon: Percent, format: 'percent', summaryKey: 'conversion_rate', dailyKey: 'conversion_rate' },
];

export const chartMetrics = metrics.filter((metric) => metric.dailyKey !== undefined);

/** Daily values for a metric; null stays null so unknown days are gaps, not zeros. */
export function dailySeries(daily: readonly DailyRow[], metric: MetricDef): (number | null)[] {
  const key = metric.dailyKey;
  if (!key) return [];
  return daily.map((day) => (day[key] === null ? null : Number(day[key])));
}
