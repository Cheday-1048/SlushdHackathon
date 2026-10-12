import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { features, type FeatureModule } from '@/content/guide';
import { transition } from '@/design-system/motion';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { IconTile, Reveal, StatusBadge } from './parts';

function FeatureCard({ feature, defaultOpen = false }: { feature: FeatureModule; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <Card className={cn('h-full gap-4 p-5 transition-[box-shadow,border-color] duration-(--duration-base)', open && 'border-ring shadow-lift', feature.status === 'planned' && 'bg-card/60')}>
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={feature.icon} active={feature.status === 'available'} />
        <StatusBadge status={feature.status} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-lg font-semibold">{feature.title}</h3>
        <p className="text-sm text-muted-foreground">{feature.tagline}</p>
        <p className="text-sm italic">“{feature.question}”</p>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${open ? 'Hide' : 'Show'} details for ${feature.title}`}
        onClick={() => setOpen((value) => !value)}
        className="mt-auto flex items-center gap-1.5 self-start rounded-lg text-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {open ? 'Hide details' : 'Show details'}
        <ChevronDown className={cn('size-4 transition-transform duration-(--duration-base)', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panelId} role="region" aria-label={`${feature.title} details`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition.base} className="overflow-hidden">
            <div className="flex flex-col gap-4 border-t border-border pt-4 text-sm">
              <div>
                <h4 className="mb-1.5 font-semibold">Implemented today</h4>
                {feature.mvp.length === 0
                  ? <p className="text-muted-foreground">Not built yet. The sidebar lists this module as Planned and disabled.</p>
                  : <ul className="flex flex-col gap-1.5 text-muted-foreground">{feature.mvp.map((line) => <li key={line} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-success" />{line}</li>)}</ul>}
              </div>
              <div>
                <h4 className="mb-1.5 font-semibold">{feature.mvp.length === 0 ? 'Vision for the full product' : 'Not built yet'}</h4>
                <ul className="flex flex-col gap-1.5 text-muted-foreground">{feature.vision.map((line) => <li key={line} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full border border-muted-foreground" />{line}</li>)}</ul>
              </div>
              {feature.needsBackend && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Runs on the FastAPI backend, so it is not available in Demo Mode.</p>}
              {feature.to && <Link to={feature.to} className="inline-flex items-center gap-1.5 self-start rounded-lg font-medium text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40">Open {feature.title} in the app<ExternalLink className="size-3.5" aria-hidden /></Link>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/** The six modules of the full product, with their status in this MVP. */
export function FeaturesSection() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {features.map((feature, index) => (
        <Reveal as="li" key={feature.id} delay={(index % 3) * 0.05} className="list-none">
          <FeatureCard feature={feature} />
        </Reveal>
      ))}
    </ul>
  );
}
