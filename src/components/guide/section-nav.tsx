import { useEffect, useState } from 'react';
import { sections, type SectionId } from '@/content/guide';
import { cn } from '@/shared/lib/utils';

const targetId = (id: SectionId) => `section-${id}`;

function scrollToSection(id: SectionId) {
  const element = document.getElementById(targetId(id));
  if (!element?.scrollIntoView) return;
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

/** Section index: a sticky list on large screens, a scrolling chip bar on small ones. Highlights the section in view. */
export function SectionNav() {
  const [active, setActive] = useState<SectionId>(sections[0].id);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => { for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id.replace('section-', '') as SectionId); },
      { root: document.getElementById('main-content'), rootMargin: '-15% 0px -70% 0px' },
    );
    for (const section of sections) { const element = document.getElementById(targetId(section.id)); if (element) observer.observe(element); }
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Guide sections" className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/80 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-6 lg:z-auto lg:mx-0 lg:self-start lg:border-b-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
      <p className="mb-2 hidden text-xs font-medium tracking-wider text-muted-foreground uppercase lg:block">On this page</p>
      <ol className="flex gap-1.5 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
        {sections.map((section, index) => (
          <li key={section.id} className="shrink-0">
            <button
              type="button"
              aria-current={active === section.id ? 'location' : undefined}
              onClick={() => { setActive(section.id); scrollToSection(section.id); }}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm whitespace-nowrap outline-none transition-colors duration-(--duration-fast) focus-visible:ring-[3px] focus-visible:ring-ring/40 lg:w-full lg:py-2',
                active === section.id ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )}
            >
              <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors duration-(--duration-fast)', active === section.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{index + 1}</span>
              {section.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
