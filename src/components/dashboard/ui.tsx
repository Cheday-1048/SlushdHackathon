import { motion } from 'motion/react';
import { AlertCircle, Info, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { transition } from '@/design-system/motion';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';

/* Small presentational pieces shared by the dashboard widgets. */

interface WidgetCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Staggers the entrance animation. */
  index?: number;
  label?: string;
}

/** Standard widget frame: title row with optional actions, then content. */
export function WidgetCard({ title, description, actions, children, className, index = 0, label }: WidgetCardProps) {
  const headingId = useId();
  return (
    <motion.section aria-labelledby={label ? undefined : headingId} aria-label={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...transition.slow, delay: Math.min(index, 6) * 0.05 }} className={cn('min-w-0', className)}>
      <Card className="h-full gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={headingId} className="font-display text-lg font-semibold">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
        {children}
      </Card>
    </motion.section>
  );
}

const noticeTone = {
  info: 'border-border bg-card text-card-foreground',
  warning: 'border-warning/40 bg-warning/10 text-foreground',
  error: 'border-destructive/40 bg-destructive/10 text-foreground',
} as const;

/** Inline banner. Pass role="alert" only for problems the user needs to hear about immediately. */
export function Notice({ tone = 'info', icon: Icon, role, children, className }: { tone?: keyof typeof noticeTone; icon?: LucideIcon; role?: 'alert' | 'status'; children: ReactNode; className?: string }) {
  const Glyph = Icon ?? (tone === 'info' ? Info : AlertCircle);
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft backdrop-blur-xl', noticeTone[tone], className)}>
      <Glyph className={cn('mt-0.5 size-[18px] shrink-0', tone === 'warning' && 'text-warning', tone === 'error' && 'text-destructive', tone === 'info' && 'text-primary')} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" aria-hidden /></span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-muted', className)} />;
}

/** Tiny dependency-free line chart for KPI cards. Gaps (unknown days) are left open, never drawn as zero. */
export function Sparkline({ data, className }: { data: (number | null)[]; className?: string }) {
  const gradientId = useId();
  const known = data.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  const w = 100;
  const h = 28;
  const min = Math.min(...known);
  const span = Math.max(...known) - min || 1;
  const point = (value: number, index: number): [number, number] => [data.length > 1 ? (index / (data.length - 1)) * w : w / 2, h - 2 - ((value - min) / span) * (h - 4)];
  const segments: [number, number][][] = [];
  let open = false;
  data.forEach((value, index) => {
    if (value === null) { open = false; return; }
    if (!open) { segments.push([]); open = true; }
    segments[segments.length - 1].push(point(value, index));
  });
  const line = (segment: [number, number][]) => segment.length === 1 ? `M${segment[0][0]},${segment[0][1]} h0.001` : `M${segment.map(([x, y]) => `${x},${y}`).join(' L')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn('h-8 w-full text-primary', className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {segments.filter((segment) => segment.length > 1).map((segment, index) => <path key={`area-${index}`} d={`${line(segment)} L${segment[segment.length - 1][0]},${h} L${segment[0][0]},${h} Z`} fill={`url(#${gradientId})`} />)}
      {segments.map((segment, index) => <path key={`line-${index}`} d={line(segment)} fill="none" stroke="currentColor" strokeWidth={segment.length === 1 ? 4 : 1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}
