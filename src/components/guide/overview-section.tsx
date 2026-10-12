import { ArrowRight, Info } from 'lucide-react';
import { overview } from '@/content/guide';
import { Card } from '@/shared/components/ui/card';
import { IconTile, Reveal, SectionHeading, StatusBadge } from './parts';

/** What saleslab.AI is, the problems it targets and how it differs from a dashboard. */
export function OverviewSection({ showHeading = true }: { showHeading?: boolean }) {
  return (
    <section aria-labelledby="guide-overview" className="flex flex-col gap-8">
      {showHeading && <SectionHeading id="guide-overview" eyebrow="Product overview" title={overview.title}>{overview.lead}</SectionHeading>}

      <div role="note" className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <Info className="mt-0.5 size-[18px] shrink-0 text-warning" aria-hidden />
        <p>{overview.mvpNote}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-semibold">The problem it targets</h3>
        <ul className="grid gap-4 sm:grid-cols-2">
          {overview.problems.map((problem, index) => (
            <Reveal as="li" key={problem.title} delay={index * 0.05} className="list-none">
              <Card className="h-full gap-3 p-5">
                <IconTile icon={problem.icon} />
                <h4 className="font-semibold">{problem.title}</h4>
                <p className="text-sm text-muted-foreground">{problem.body}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-semibold">Not another analytics dashboard</h3>
        <Card className="gap-0 overflow-hidden p-0">
          <div className="hidden grid-cols-[1fr_auto_1fr] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid" aria-hidden>
            <span>A typical analytics dashboard</span><span /><span>saleslab.AI (full vision)</span>
          </div>
          <ul>
            {overview.comparison.map((row) => (
              <li key={row.saleslab} className="grid gap-2 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
                <span className="text-sm text-muted-foreground"><span className="sr-only">Typical dashboard: </span>{row.dashboard}</span>
                <ArrowRight className="hidden size-4 text-primary sm:block" aria-hidden />
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium"><span className="sr-only">saleslab.AI: </span>{row.saleslab}<StatusBadge status={row.status} /></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-semibold">The value for a business</h3>
        <ul className="grid gap-4 sm:grid-cols-2">
          {overview.values.map((value, index) => (
            <Reveal as="li" key={value.title} delay={index * 0.05} className="list-none">
              <Card className="h-full gap-3 p-5">
                <div className="flex items-start justify-between gap-3"><IconTile icon={value.icon} /><StatusBadge status={value.status} /></div>
                <h4 className="font-semibold">{value.title}</h4>
                <p className="text-sm text-muted-foreground">{value.body}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
