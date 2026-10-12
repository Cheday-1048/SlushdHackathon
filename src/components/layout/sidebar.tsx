import { motion } from 'motion/react';
import { BarChart3, BookOpen, Bot, FlaskConical, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Split, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { transition } from '@/design-system/motion';
import { Button } from '@/shared/components/ui/button';
import { Tooltip } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { BrandMark } from './brand-mark';

const EXPANDED = 256;
const COLLAPSED = 72;

interface NavEntry { label: string; icon: LucideIcon; to: string; active: (pathname: string, hash: string) => boolean }

const pages: NavEntry[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard', active: (pathname, hash) => pathname === '/dashboard' && hash !== '#analytics' },
  { label: 'Analytics', icon: BarChart3, to: '/dashboard#analytics', active: (pathname, hash) => pathname === '/dashboard' && hash === '#analytics' },
  { label: 'Simulation Lab', icon: FlaskConical, to: '/simulation-lab', active: (pathname) => pathname === '/simulation-lab' },
  { label: 'AI Assistant', icon: Bot, to: '/ai-assistant', active: (pathname) => pathname === '/ai-assistant' },
  { label: 'Guide', icon: BookOpen, to: '/guide', active: (pathname) => pathname === '/guide' },
];

// Real-traffic A/B testing has no backend yet. It stays visible but disabled, never as a working feature.
const planned = [
  { label: 'A/B Testing', icon: Split },
];

/**
 * Left navigation. Collapses to an icon rail (md+) and is hidden below md until opened from the top bar.
 * Below lg an expanded sidebar overlays the content instead of pushing it.
 */
export function Sidebar({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void }) {
  const { pathname, hash } = useLocation();
  const isLarge = useMediaQuery('(min-width: 1024px)');

  return (
    <div className={cn('relative shrink-0 transition-[width] duration-(--duration-base) ease-(--ease-soft)', collapsed ? 'w-0 md:w-[72px]' : 'w-0 md:w-[72px] lg:w-[256px]')}>
      {!collapsed && <button type="button" aria-label="Close navigation" onClick={() => onCollapsedChange(true)} className="fixed inset-0 z-30 bg-foreground/25 backdrop-blur-[1px] lg:hidden" />}
      <motion.aside
        aria-label="Application navigation"
        initial={false}
        animate={{ width: collapsed ? COLLAPSED : EXPANDED }}
        transition={transition.base}
        className={cn('absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-border bg-popover/90 backdrop-blur-xl', collapsed && 'max-md:hidden')}
      >
        <div className={cn('flex h-16 shrink-0 items-center px-4', collapsed ? 'justify-center px-0' : 'justify-between gap-2 pr-3')}>
          {collapsed ? (
            <Tooltip content="Expand navigation">
              <Button variant="ghost" size="icon" onClick={() => onCollapsedChange(false)} aria-label="Expand navigation" aria-expanded={false}><PanelLeftOpen aria-hidden /></Button>
            </Tooltip>
          ) : (
            <>
              <BrandMark />
              <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onCollapsedChange(true)} aria-label="Collapse navigation" aria-expanded><PanelLeftClose aria-hidden /></Button>
            </>
          )}
        </div>

        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pt-2">
          {pages.map((item) => {
            const active = item.active(pathname, hash);
            return (
              <Tooltip key={item.label} content={item.label} disabled={!collapsed}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  onClick={() => {
                    if (item.to.endsWith('#analytics')) document.getElementById('analytics')?.scrollIntoView();
                    if (!isLarge) onCollapsedChange(true);
                  }}
                  className={cn(
                    'relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors duration-(--duration-fast) focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    collapsed && 'justify-center px-0',
                    active ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                  )}
                >
                  {active && <motion.span layoutId="app-nav-active" transition={transition.base} className="absolute inset-0 -z-10 rounded-xl border border-border bg-secondary shadow-soft" />}
                  <item.icon className={cn('size-[18px] shrink-0', active && 'text-primary')} aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </Tooltip>
            );
          })}

          <div className="my-2 border-t border-border" role="presentation" />
          {planned.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              disabled
              title="Planned for a future phase"
              aria-label={collapsed ? `${label} Planned` : undefined}
              className={cn('flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground opacity-60', collapsed && 'justify-center px-0')}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">Planned</span>}
            </button>
          ))}
        </nav>

        {!collapsed && (
          <div className="shrink-0 border-t border-border px-5 py-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Phase 08</p>
            <p>Decision support · synthetic business data</p>
          </div>
        )}
      </motion.aside>
    </div>
  );
}
