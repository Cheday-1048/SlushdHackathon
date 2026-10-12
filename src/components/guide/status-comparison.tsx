import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import { useState } from 'react';
import { capabilities, verification, type Status } from '@/content/guide';
import { Card } from '@/shared/components/ui/card';
import { Segmented } from '@/shared/components/ui/segmented';
import { cn } from '@/shared/lib/utils';
import { StatusBadge } from './parts';

type Filter = 'all' | Status;

/** Capability list generated from src/content/guide.ts; every "available" item cites files that the test suite checks exist. */
export function StatusComparison() {
  const [filter, setFilter] = useState<Filter>('all');
  const count = (status: Status) => capabilities.filter((item) => item.status === status).length;
  const visible = capabilities.filter((item) => filter === 'all' || item.status === filter);

  const summary: { status: Status; icon: typeof CheckCircle2; text: string }[] = [
    { status: 'available', icon: CheckCircle2, text: 'Implemented' },
    { status: 'partial', icon: CircleDot, text: 'Partly implemented' },
    { status: 'planned', icon: CircleDashed, text: 'Planned (not built)' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-3 sm:grid-cols-3" aria-label="Capability summary">
        {summary.map(({ status, icon: Icon, text }) => (
          <li key={status}>
            <Card className="h-full flex-row items-center gap-4 p-4">
              <span className={cn('grid size-11 place-items-center rounded-xl', status === 'available' && 'bg-success/14 text-success', status === 'partial' && 'bg-warning/16 text-warning', status === 'planned' && 'bg-muted text-muted-foreground')}><Icon className="size-5" aria-hidden /></span>
              <span><span className="block font-display text-2xl font-semibold tabular-nums">{count(status)}</span><span className="text-sm text-muted-foreground">{text}</span></span>
            </Card>
          </li>
        ))}
      </ul>

      <Segmented<Filter>
        label="Filter capabilities"
        value={filter}
        onChange={setFilter}
        options={[{ value: 'all', label: `All (${capabilities.length})` }, { value: 'available', label: 'Implemented' }, { value: 'partial', label: 'Partly' }, { value: 'planned', label: 'Planned' }]}
      />

      <ul className="grid gap-3 md:grid-cols-2" aria-label="Capabilities">
        {visible.map((item) => (
          <li key={item.id}>
            <Card className={cn('h-full gap-2 p-4', item.status === 'planned' && 'border-dashed bg-card/50')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-xs text-muted-foreground">{item.area}</p><h3 className="font-semibold">{item.title}</h3></div>
                <StatusBadge status={item.status} />
              </div>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              {item.evidence && item.evidence.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-primary">Evidence in the repository</summary>
                  <ul className="mt-1.5 flex flex-col gap-1 font-mono">{item.evidence.map((path) => <li key={path} className="[overflow-wrap:anywhere]">{path}</li>)}{item.endpoints?.map((path) => <li key={path}>GET {path}</li>)}</ul>
                </details>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <Card className="gap-2 p-5 text-sm">
        <h3 className="font-display text-lg font-semibold">Verification status</h3>
        <p><span className="font-medium text-success">Verified. </span>{verification.verified}</p>
        <p><span className="font-medium text-warning">Open. </span>{verification.notVerified}</p>
      </Card>
    </div>
  );
}
