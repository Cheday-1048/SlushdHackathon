import { Presentation } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { presentation } from '@/content/guide';
import { ArchitectureDiagram } from '@/components/guide/architecture-diagram';
import { FeaturesSection } from '@/components/guide/features-section';
import { OverviewSection } from '@/components/guide/overview-section';
import { SectionHeading } from '@/components/guide/parts';
import { PresentationView } from '@/components/guide/presentation-view';
import { ScenarioWalkthrough } from '@/components/guide/scenario-walkthrough';
import { SectionNav } from '@/components/guide/section-nav';
import { StatusComparison } from '@/components/guide/status-comparison';
import { WorkflowDiagram } from '@/components/guide/workflow-diagram';
import { Button } from '@/shared/components/ui/button';
import { brand } from '@/design-system/brand';

/** Interactive product guide. `?view=presentation&step=N` switches to the step-by-step presentation view. */
export function GuidePage() {
  const [params, setParams] = useSearchParams();
  const presenting = params.get('view') === 'presentation';
  const requested = Number.parseInt(params.get('step') ?? '1', 10);
  const step = Math.min(Math.max(Number.isNaN(requested) ? 1 : requested, 1), presentation.length) - 1;

  const startPresentation = () => setParams({ view: 'presentation', step: '1' });
  const exitPresentation = () => setParams({});
  const goToStep = (next: number) => setParams({ view: 'presentation', step: String(next + 1) }, { replace: true });

  return <>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{brand.name}</p>
        <h2 className="mt-1 text-3xl font-semibold">Product guide</h2>
        <p className="mt-1 text-muted-foreground">What {brand.name} is, how it works and where it is going. Planned modules are labelled as planned.</p>
      </div>
      {!presenting && <Button onClick={startPresentation}><Presentation aria-hidden />Presentation mode</Button>}
    </header>

    {presenting
      ? <PresentationView step={step} onStepChange={goToStep} onExit={exitPresentation} />
      : <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <SectionNav />
        <div className="flex min-w-0 flex-col gap-16">
          <div id="section-overview" className="scroll-mt-16 lg:scroll-mt-6"><OverviewSection /></div>
          <section id="section-workflow" aria-labelledby="guide-workflow" className="flex scroll-mt-16 flex-col gap-6 lg:scroll-mt-6">
            <SectionHeading id="guide-workflow" eyebrow="How it works" title="From business data to a monitored decision">Seven connected stages. Each one hands its result to the next, and monitoring feeds back into the start.</SectionHeading>
            <WorkflowDiagram />
          </section>
          <section id="section-features" aria-labelledby="guide-features" className="flex scroll-mt-16 flex-col gap-6 lg:scroll-mt-6">
            <SectionHeading id="guide-features" eyebrow="Core features" title="Six modules, one purpose: better decisions">Two modules work in this MVP. The other four are the product vision and are shown as planned.</SectionHeading>
            <FeaturesSection />
          </section>
          <section id="section-scenario" aria-labelledby="guide-scenario" className="flex scroll-mt-16 flex-col gap-6 lg:scroll-mt-6">
            <SectionHeading id="guide-scenario" eyebrow="Business scenario" title="One problem, followed through the whole product">Step through an example to see how the modules work together. The numbers are illustrative.</SectionHeading>
            <ScenarioWalkthrough />
          </section>
          <section id="section-architecture" aria-labelledby="guide-architecture" className="flex scroll-mt-16 flex-col gap-6 lg:scroll-mt-6">
            <SectionHeading id="guide-architecture" eyebrow="System architecture" title="What is built, and what is only planned">The real stack is shown as implemented. Planned services are drawn dashed because no technical design exists for them yet.</SectionHeading>
            <ArchitectureDiagram />
          </section>
          <section id="section-status" aria-labelledby="guide-status" className="flex scroll-mt-16 flex-col gap-6 lg:scroll-mt-6">
            <SectionHeading id="guide-status" eyebrow="MVP vs final product" title="The current build is a hackathon MVP">This comparison is generated from the same content file as the rest of the Guide, and every available item cites files in the repository.</SectionHeading>
            <StatusComparison />
          </section>
        </div>
      </div>}
  </>;
}
