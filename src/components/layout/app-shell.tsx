import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { transition } from '@/design-system/motion';
import { AnimatedBackground } from '@/shared/components/layout/animated-background';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/** Application frame: sidebar | top bar + scrolling content. Pages only render their own content. */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Start with an icon rail on narrower windows; afterwards the user is in control.
  const isLarge = useMediaQuery('(min-width: 1024px)');
  const [collapsed, setCollapsed] = useState(!isLarge);

  return (
    <TooltipProvider delayDuration={150}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="relative flex h-dvh w-full overflow-hidden">
        <AnimatedBackground />
        <Sidebar collapsed={collapsed} onCollapsedChange={setCollapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenNavigation={() => setCollapsed(false)} />
          <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
            <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition.base} className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
              {children}
            </motion.div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
