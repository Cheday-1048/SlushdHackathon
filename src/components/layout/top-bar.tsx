import { Menu, Moon, Palette, Sun } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { brand } from '@/design-system/brand';
import { useTheme } from '@/design-system/theme-context';
import { AppearanceControls } from '@/shared/components/layout/appearance-controls';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Tooltip } from '@/shared/components/ui/tooltip';
import { useFocusOnMount } from '@/hooks/use-focus-on-mount';

const titles: Record<string, string> = { '/dashboard': 'Dashboard' };

/** Page title with a key so focus moves to it whenever the page changes. */
function PageTitle({ title }: { title: string }) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  return <h1 ref={ref} tabIndex={-1} className="truncate font-display text-lg leading-tight font-semibold outline-none">{title}</h1>;
}

/** Top bar: location (breadcrumb + title), theme toggle and appearance settings. */
export function TopBar({ onOpenNavigation }: { onOpenNavigation: () => void }) {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const title = titles[pathname] ?? 'Not found';
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/50 px-3 backdrop-blur-xl sm:gap-3 sm:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={onOpenNavigation}><Menu aria-hidden /></Button>
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="hidden text-xs text-muted-foreground sm:block">
          <ol className="flex items-center gap-1.5"><li>{brand.name}</li><li aria-hidden>/</li><li aria-current="page">{title}</li></ol>
        </nav>
        <PageTitle key={pathname} title={title} />
      </div>
      <span className="flex-1" />
      <Tooltip content={`Switch to ${nextTheme} theme`} side="bottom">
        <Button variant="ghost" size="icon" aria-label={`Switch to ${nextTheme} theme`} onClick={toggleTheme}>{theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}</Button>
      </Tooltip>
      <Tooltip content="Appearance" side="bottom">
        <Button variant="ghost" size="icon" aria-label="Appearance" onClick={() => setAppearanceOpen(true)}><Palette aria-hidden /></Button>
      </Tooltip>
      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appearance</DialogTitle>
            <DialogDescription>Changes apply immediately and are remembered in this browser.</DialogDescription>
          </DialogHeader>
          <AppearanceControls />
        </DialogContent>
      </Dialog>
    </header>
  );
}
