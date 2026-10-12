import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowRight, Check, Lock, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { architecture } from '@/content/guide';
import { transition } from '@/design-system/motion';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { IconTile, StatusBadge } from './parts';

/** Layered view of the real stack, with planned services shown as a dashed, unspecified component. */
export function ArchitectureDiagram() {
  const { nodes, security } = architecture;
  const [selectedId, setSelectedId] = useState('api');
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const implemented = nodes.filter((node) => node.status === 'available');
  const planned = nodes.find((node) => node.status === 'planned');

  const nodeButton = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return null;
    const active = selectedId === id;
    const isPlanned = node.status === 'planned';
    return (
      <button
        key={id}
        type="button"
        aria-pressed={active}
        onClick={() => setSelectedId(id)}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left outline-none transition-[transform,box-shadow,border-color] duration-(--duration-base) ease-(--ease-soft) hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-[3px] focus-visible:ring-ring/40',
          isPlanned ? 'border-dashed bg-card/40' : 'bg-card',
          active ? 'border-ring shadow-lift' : 'border-border',
        )}
      >
        <IconTile icon={node.icon} active={active && !isPlanned} className="size-9" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{node.title}</span>
          <span className="block text-xs text-muted-foreground">{node.subtitle}</span>
        </span>
        <span className="sr-only">{isPlanned ? 'Planned, not built.' : 'Implemented.'}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-label="Legend" role="group">
        <span className="flex items-center gap-2"><span aria-hidden className="h-4 w-8 rounded-md border border-border bg-card" />Implemented</span>
        <span className="flex items-center gap-2"><span aria-hidden className="h-4 w-8 rounded-md border border-dashed border-muted-foreground/70 bg-card/40" />Planned, not designed yet</span>
      </div>

      <div className="grid items-center gap-2 lg:grid-cols-(--arch-cols)" style={{ '--arch-cols': implemented.flatMap((_, index) => (index === 0 ? ['minmax(0,1fr)'] : ['auto', 'minmax(0,1fr)'])).join(' ') } as CSSProperties}>
        {implemented.map((node, position) => (
          <div key={node.id} className="contents">
            {nodeButton(node.id)}
            {position < implemented.length - 1 && (
              <>
                <ArrowRight aria-hidden className="hidden size-5 text-primary lg:block" />
                <ArrowDown aria-hidden className="mx-auto size-5 text-primary lg:hidden" />
              </>
            )}
          </div>
        ))}
      </div>
      {planned && (
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
          <span aria-hidden className="ml-6 h-6 w-px border-l border-dashed border-muted-foreground/60 sm:ml-0 sm:h-px sm:w-10 sm:border-t sm:border-l-0" />
          <div className="w-full sm:max-w-sm">{nodeButton(planned.id)}</div>
          <p className="text-xs text-muted-foreground">Intended to sit behind the same API boundary.</p>
        </div>
      )}

      <Card className="gap-3 p-5" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={selected.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={transition.fast} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">{selected.title}</h3>
              <StatusBadge status={selected.status === 'available' ? 'available' : 'planned'} />
            </div>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {selected.details.map((line) => <li key={line} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />{line}</li>)}
            </ul>
            {selected.note && <p className="text-xs font-medium text-muted-foreground">{selected.note}</p>}
          </motion.div>
        </AnimatePresence>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3 p-5">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold"><Lock className="size-4 text-primary" aria-hidden />Security and data handling today</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">{security.today.map((line) => <li key={line} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{line}</li>)}</ul>
        </Card>
        <Card className="gap-3 p-5">
          <h3 className="font-display text-lg font-semibold">Not built yet</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">{security.notYet.map((line) => <li key={line} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{line}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
