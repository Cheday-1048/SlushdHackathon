import { motion } from 'motion/react';
import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import type { ReactNode } from 'react';
import { statusLabels, type Status } from '@/content/guide';
import { transition } from '@/design-system/motion';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/lib/utils';

const statusVariant = { available: 'success', partial: 'warning', planned: 'outline' } as const;
const statusIcon = { available: CheckCircle2, partial: CircleDot, planned: CircleDashed } as const;

/** Availability marker used everywhere in the Guide. The text is always present, not only the color. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const Icon = statusIcon[status];
  return <Badge variant={statusVariant[status]} className={className}><Icon className="size-3" aria-hidden />{statusLabels[status]}</Badge>;
}

export function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wider text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
      {children && <p className="max-w-3xl text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Fades content in once as it scrolls into view. */
export function Reveal({ children, className, delay = 0, as = 'div' }: { children: ReactNode; className?: string; delay?: number; as?: 'div' | 'li' }) {
  const Component = as === 'li' ? motion.li : motion.div;
  return (
    <Component initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -8% 0px' }} transition={{ ...transition.slow, delay }} className={className}>
      {children}
    </Component>
  );
}

export function IconTile({ icon: Icon, active = false, className }: { icon: typeof CheckCircle2; active?: boolean; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-(--duration-base)', active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary', className)}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}
