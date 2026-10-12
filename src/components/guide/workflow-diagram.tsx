import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { workflow } from '@/content/guide';
import { transition } from '@/design-system/motion';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { IconTile, StatusBadge } from './parts';

const statusDot = { available: 'bg-success', partial: 'bg-warning', planned: 'bg-muted-foreground/50' } as const;

/** The seven-stage flow. Select a stage, step through, or play the flow to see how each stage feeds the next. */
export function WorkflowDiagram() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stage = workflow[index];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % workflow.length), 2600);
    return () => window.clearInterval(timer);
  }, [playing]);

  const select = (next: number) => { setPlaying(false); setIndex(next); };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Select a stage, or play the flow to follow the data from start to finish.</p>
        <Button size="sm" variant="outline" onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}{playing ? 'Pause flow' : 'Play flow'}
        </Button>
      </div>

      <ol aria-label="Workflow stages" className="grid gap-1 lg:grid-cols-[repeat(7,minmax(0,1fr))] lg:gap-0">
        {workflow.map((item, position) => {
          const active = position === index;
          const passed = position < index;
          return (
            <li key={item.id} className="relative flex lg:flex-col lg:items-stretch">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => select(position)}
                className={cn(
                  'group relative flex w-full items-center gap-3 rounded-2xl border p-3 text-left outline-none transition-[transform,box-shadow,border-color,background-color] duration-(--duration-base) ease-(--ease-soft) hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-[3px] focus-visible:ring-ring/40 lg:mx-1 lg:flex-col lg:items-start lg:gap-2.5',
                  active ? 'border-ring bg-card shadow-lift' : 'border-border bg-card/60',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <IconTile icon={item.icon} active={active || passed} className="size-9" />
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span aria-hidden className={cn('size-2 rounded-full', statusDot[item.status])} />{position + 1}</span>
                </span>
                <span className="min-w-0 text-sm font-semibold">{item.title}</span>
                <span className="sr-only">{item.status === 'planned' ? 'Planned.' : item.status === 'partial' ? 'Partly in the MVP.' : 'Available in the MVP.'}</span>
              </button>
              {position < workflow.length - 1 && (
                <span aria-hidden className="absolute top-1/2 -right-2.5 z-10 hidden -translate-y-1/2 lg:block">
                  <ArrowRight className={cn('size-4 transition-colors duration-(--duration-base)', passed || active ? 'text-primary' : 'text-muted-foreground/50')} />
                </span>
              )}
              {position < workflow.length - 1 && <ArrowDown aria-hidden className="absolute -bottom-2.5 left-7 z-10 size-4 text-muted-foreground/50 lg:hidden" />}
            </li>
          );
        })}
      </ol>

      <Card className="gap-5 p-5 sm:p-6" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={stage.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={transition.fast} className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <IconTile icon={stage.icon} active />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Stage {index + 1} of {workflow.length}</p>
                  <h3 className="font-display text-xl font-semibold">{stage.title}</h3>
                </div>
              </div>
              <StatusBadge status={stage.status} />
            </div>
            <p className="max-w-3xl">{stage.summary}</p>
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold">What it does</h4>
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {stage.does.map((line) => <li key={line} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{line}</li>)}
                </ul>
              </div>
              <dl className="flex flex-col gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">Receives</dt><dd className="font-medium">{stage.receives}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Hands on</dt><dd className="font-medium">{stage.hands}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Value for the business</dt><dd className="font-medium">{stage.value}</dd></div>
              </dl>
            </div>
            <div className={cn('rounded-xl border px-4 py-3 text-sm', stage.status === 'planned' ? 'border-border bg-muted/40' : stage.status === 'partial' ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10')}>
              <span className="font-medium">In the MVP today: </span>{stage.today}
            </div>
            <div className="flex items-center justify-between gap-3">
              <Button size="sm" variant="ghost" onClick={() => select((index - 1 + workflow.length) % workflow.length)} aria-label="Previous stage"><ChevronLeft aria-hidden />Previous</Button>
              <Button size="sm" variant="ghost" onClick={() => select((index + 1) % workflow.length)} aria-label="Next stage">Next<ChevronRight aria-hidden /></Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </Card>
    </div>
  );
}
