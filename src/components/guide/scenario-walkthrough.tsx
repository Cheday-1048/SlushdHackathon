import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Info, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { scenario, type ScenarioVisual } from '@/content/guide';
import { transition } from '@/design-system/motion';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { IconTile, StatusBadge } from './parts';

const toneText = { good: 'text-success', bad: 'text-destructive', neutral: 'text-muted-foreground' } as const;
const toneBar = { good: 'bg-success', bad: 'bg-destructive', neutral: 'bg-muted-foreground/60' } as const;

function Visual({ visual }: { visual: ScenarioVisual }) {
  switch (visual.kind) {
    case 'metrics':
      return (
        <ul className="grid gap-3 sm:grid-cols-3">
          {visual.items.map((item) => (
            <li key={item.label} className="rounded-xl border border-border bg-surface/60 p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 font-display">
                <span className="text-sm text-muted-foreground line-through decoration-muted-foreground/50">{item.before}</span>
                <span className={cn('text-2xl font-semibold tabular-nums', toneText[item.tone])}>{item.after}</span>
              </p>
            </li>
          ))}
        </ul>
      );
    case 'bars': {
      const max = Math.max(...visual.rows.map((row) => row.value));
      return (
        <figure className="flex flex-col gap-3">
          <figcaption className="text-xs text-muted-foreground">{visual.caption}</figcaption>
          <ul className="flex flex-col gap-3">
            {visual.rows.map((row) => (
              <li key={row.label} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_3.5rem]">
                <span className="truncate">{row.label}</span>
                <span className="h-3 overflow-hidden rounded-full bg-muted"><motion.span initial={{ width: 0 }} animate={{ width: `${(row.value / max) * 100}%` }} transition={transition.slow} className={cn('block h-full rounded-full', toneBar[row.tone])} /></span>
                <span className={cn('text-right font-medium tabular-nums', toneText[row.tone])}>{row.display}</span>
              </li>
            ))}
          </ul>
        </figure>
      );
    }
    case 'findings':
      return (
        <ol className="flex flex-col gap-3">
          {visual.items.map((item, index) => (
            <li key={item.title} className="flex gap-3 rounded-xl border border-border bg-surface/60 p-4">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">{index + 1}</span>
              <div className="min-w-0 text-sm"><p className="font-medium">{item.title}</p><p className="mt-1 text-muted-foreground"><span className="font-medium">Evidence: </span>{item.evidence}</p></div>
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <figure className="flex flex-col gap-2">
          <figcaption className="text-xs text-muted-foreground">{visual.caption}</figcaption>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{visual.columns.map((column, index) => <th key={`${column}-${index}`} scope="col" className="px-4 py-2.5 font-medium">{column || <span className="sr-only">Measure</span>}</th>)}</tr></thead>
              <tbody>
                {visual.rows.map((row) => (
                  <tr key={row.cells.join('|')} className={cn('border-t border-border', row.highlight && 'bg-success/10')}>
                    {row.cells.map((cell, index) => index === 0 ? <th key={cell} scope="row" className="px-4 py-3 text-left font-medium">{cell}</th> : <td key={`${cell}-${index}`} className="px-4 py-3 tabular-nums">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );
    case 'checklist':
      return (
        <ul className="flex flex-col gap-2.5">
          {visual.items.map((item) => (
            <li key={item.label} className="flex items-center gap-3 text-sm">
              {item.done ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> : <Circle className="size-5 shrink-0 text-muted-foreground/60" aria-hidden />}
              <span>{item.label}</span>
              <span className="sr-only">{item.done ? '(works in the MVP)' : '(planned)'}</span>
            </li>
          ))}
        </ul>
      );
  }
}

/** One problem followed through the whole product. Numbers are illustrative and every step shows its availability. */
export function ScenarioWalkthrough() {
  const { steps } = scenario;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = steps[index];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % steps.length), 4200);
    return () => window.clearInterval(timer);
  }, [playing, steps.length]);

  const select = (next: number) => { setPlaying(false); setIndex(next); };

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-3 p-5">
        <h3 className="font-display text-xl font-semibold">{scenario.title}</h3>
        <p className="max-w-3xl">{scenario.situation}</p>
        <div role="note" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <Info className="mt-0.5 size-[18px] shrink-0 text-warning" aria-hidden />
          <p><span className="font-semibold">Illustrative example. </span>{scenario.disclaimer}</p>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
        <div className="flex flex-col gap-3">
          <Button size="sm" variant="outline" className="self-start" onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}{playing ? 'Pause walkthrough' : 'Play walkthrough'}
          </Button>
          <ol aria-label="Scenario steps" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {steps.map((item, position) => {
              const active = position === index;
              return (
                <li key={item.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={`Step ${position + 1}: ${item.module}`}
                    onClick={() => select(position)}
                    className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm outline-none transition-[background-color,border-color,box-shadow] duration-(--duration-base) focus-visible:ring-[3px] focus-visible:ring-ring/40', active ? 'border-ring bg-card shadow-soft' : 'border-border bg-card/50 hover:bg-card')}
                  >
                    <span aria-hidden className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold', active || position < index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{position + 1}</span>
                    <span className="whitespace-nowrap lg:whitespace-normal">{item.module}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <Card className="gap-5 p-5 sm:p-6" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={transition.fast} className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <IconTile icon={step.icon} active />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Step {index + 1} of {steps.length} · {step.module}</p>
                    <h3 className="font-display text-xl font-semibold">{step.headline}</h3>
                  </div>
                </div>
                <StatusBadge status={step.status} />
              </div>
              <p className="max-w-2xl text-muted-foreground">{step.body}</p>
              <Visual visual={step.visual} />
              <p className={cn('rounded-xl border px-4 py-3 text-sm', step.status === 'planned' ? 'border-border bg-muted/40' : step.status === 'partial' ? 'border-warning/40 bg-warning/10' : 'border-success/40 bg-success/10')}><span className="font-medium">Status today: </span>{step.today}</p>
              <div className="flex items-center justify-between gap-3">
                <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => select(index - 1)} aria-label="Previous scenario step"><ChevronLeft aria-hidden />Previous</Button>
                <Button size="sm" variant="ghost" disabled={index === steps.length - 1} onClick={() => select(index + 1)} aria-label="Next scenario step">Next<ChevronRight aria-hidden /></Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
