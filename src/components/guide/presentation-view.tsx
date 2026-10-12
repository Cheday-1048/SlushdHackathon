import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { overview, presentation, type PresentationId } from '@/content/guide';
import { transition } from '@/design-system/motion';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { ArchitectureDiagram } from './architecture-diagram';
import { FeaturesSection } from './features-section';
import { IconTile, StatusBadge } from './parts';
import { ScenarioWalkthrough } from './scenario-walkthrough';
import { StatusComparison } from './status-comparison';
import { WorkflowDiagram } from './workflow-diagram';

function MiniCards({ items }: { items: { icon: LucideIcon; title: string; body: string; status?: 'available' | 'partial' | 'planned' }[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.title}>
          <Card className="h-full gap-2 p-4">
            <div className="flex items-start justify-between gap-2"><IconTile icon={item.icon} className="size-9" />{item.status && <StatusBadge status={item.status} />}</div>
            <h3 className="font-semibold">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.body}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Visual({ id }: { id: PresentationId }) {
  switch (id) {
    case 'overview': return <MiniCards items={overview.values} />;
    case 'problem': return <MiniCards items={overview.problems} />;
    case 'solution':
      return (
        <Card className="gap-0 overflow-hidden p-0">
          <ul>
            {overview.comparison.map((row) => (
              <li key={row.saleslab} className="grid gap-2 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[1fr_auto_1.2fr] sm:items-center sm:gap-4">
                <span className="text-sm text-muted-foreground"><span className="sr-only">Typical dashboard: </span>{row.dashboard}</span>
                <ArrowRight className="hidden size-4 text-primary sm:block" aria-hidden />
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="sr-only">saleslab.AI: </span>{row.saleslab}<StatusBadge status={row.status} /></span>
              </li>
            ))}
          </ul>
        </Card>
      );
    case 'workflow': return <WorkflowDiagram />;
    case 'features': return <FeaturesSection />;
    case 'scenario': return <ScenarioWalkthrough />;
    case 'vision': return <StatusComparison />;
  }
}

/** Step-by-step walkthrough for a live presentation. A view of the Guide page, driven by the same content. */
export function PresentationView({ step, onStepChange, onExit }: { step: number; onStepChange: (step: number) => void; onExit: () => void }) {
  const current = presentation[step];
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const last = presentation.length - 1;

  useEffect(() => setDetailsOpen(false), [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'ArrowRight' && step < last) onStepChange(step + 1);
      if (event.key === 'ArrowLeft' && step > 0) onStepChange(step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, last, onStepChange]);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    if (!document.documentElement.requestFullscreen) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  return (
    <section aria-label="Presentation mode" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Presentation steps" className="min-w-0">
          <ol className="flex flex-wrap gap-1.5">
            {presentation.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-label={`Go to step ${index + 1}: ${item.label}`}
                  aria-current={index === step ? 'step' : undefined}
                  onClick={() => onStepChange(index)}
                  className={cn('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium outline-none transition-colors duration-(--duration-fast) focus-visible:ring-[3px] focus-visible:ring-ring/40', index === step ? 'border-ring bg-secondary text-foreground' : index < step ? 'border-border text-foreground hover:bg-muted' : 'border-border text-muted-foreground hover:bg-muted')}
                >
                  <span aria-hidden className={cn('grid size-4 place-items-center rounded-full text-[10px]', index <= step ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{index + 1}</span>
                  <span className="hidden xl:inline">{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={toggleFullscreen} aria-pressed={fullscreen}>{fullscreen ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}{fullscreen ? 'Exit full screen' : 'Full screen'}</Button>
          <Button size="sm" variant="ghost" onClick={onExit}><X aria-hidden />Exit presentation</Button>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Presentation progress" aria-valuemin={1} aria-valuemax={presentation.length} aria-valuenow={step + 1}>
        <motion.div initial={false} animate={{ width: `${((step + 1) / presentation.length) * 100}%` }} transition={transition.base} className="h-full rounded-full bg-primary" />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={transition.base} className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
            <div className="flex flex-col gap-4">
              <p className="text-xs font-medium tracking-wider text-primary uppercase">Step {step + 1} of {presentation.length} · {current.label}</p>
              <h2 className="font-display text-3xl leading-tight font-semibold sm:text-4xl" aria-live="polite">{current.title}</h2>
              <p className="text-lg text-muted-foreground">{current.message}</p>
              <ul className="flex flex-col gap-2.5">
                {current.points.map((point) => <li key={point} className="flex gap-2.5"><Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />{point}</li>)}
              </ul>
              <div>
                <button
                  type="button"
                  aria-expanded={detailsOpen}
                  onClick={() => setDetailsOpen((value) => !value)}
                  className="flex items-center gap-1.5 rounded-lg text-sm font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  Technical details<ChevronDown className={cn('size-4 transition-transform duration-(--duration-base)', detailsOpen && 'rotate-180')} aria-hidden />
                </button>
                <AnimatePresence initial={false}>
                  {detailsOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition.base} className="overflow-hidden">
                      <div role="region" aria-label="Technical details" className="mt-3 rounded-xl border border-border bg-card/60 p-4 text-sm">
                        <h3 className="mb-2 font-semibold">{current.details.title}</h3>
                        <ul className="flex flex-col gap-1.5 text-muted-foreground">{current.details.items.map((item) => <li key={item} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="min-w-0"><Visual id={current.id} /></div>
          </div>
          {detailsOpen && current.id === 'workflow' && <ArchitectureDiagram />}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button variant="outline" disabled={step === 0} onClick={() => onStepChange(step - 1)}><ChevronLeft aria-hidden />Previous step</Button>
        <p className="hidden text-xs text-muted-foreground sm:block">Use the left and right arrow keys to move between steps.</p>
        {step < last ? <Button onClick={() => onStepChange(step + 1)}>Next step<ChevronRight aria-hidden /></Button> : <Button onClick={onExit}>Finish<Check aria-hidden /></Button>}
      </div>
    </section>
  );
}
