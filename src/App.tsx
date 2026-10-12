import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { isDemoMode } from './api/client';
import { AppShell } from './components/layout/app-shell';
import { DashboardPage } from './pages/dashboard';
import { GuidePage } from './pages/guide';
import { SimulationLabPage } from './pages/simulation-lab';
import { useTheme } from '@/design-system/theme-context';
import { ThemeProvider } from '@/design-system/theme-provider';
import { BackgroundProvider } from '@/shared/components/layout/background-provider';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';

/** Simulation Lab and the AI assistant call backend services, so Demo Mode explains why they are not available there. */
function NeedsBackend({ name }: { name: string }) {
  return <Card className="items-start gap-3 p-8"><h2 className="text-2xl font-semibold">{name} needs the backend</h2><p className="max-w-2xl text-muted-foreground">This is the Demo Mode build: it runs on bundled sample data without a backend, so {name} is not available here. Dashboard, Analytics and the Guide work in Demo Mode.</p><Button asChild><Link to="/dashboard">Back to dashboard</Link></Button></Card>;
}

/** Motion for React follows the OS preference, or always reduces when the user chose "Reduce motion". */
function Motion({ children }: { children: ReactNode }) {
  const { motionPreference } = useTheme();
  return <MotionConfig reducedMotion={motionPreference === 'reduced' ? 'always' : 'user'}>{children}</MotionConfig>;
}

export function App() {
  return <ThemeProvider><BackgroundProvider><Motion><AppShell><Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/simulation-lab" element={isDemoMode() ? <NeedsBackend name="Simulation Lab" /> : <SimulationLabPage key="simulation" />} />
    <Route path="/ai-assistant" element={isDemoMode() ? <NeedsBackend name="The AI Assistant" /> : <SimulationLabPage key="assistant" initialMode="assistant" />} />
    <Route path="/guide" element={<GuidePage />} />
    <Route path="*" element={<Card className="items-start gap-3 p-8"><h2 className="text-2xl font-semibold">Page not found</h2><p className="text-muted-foreground">This page is not available in Phase 08.</p><Button asChild><Link to="/dashboard">Back to dashboard</Link></Button></Card>} />
  </Routes></AppShell></Motion></BackgroundProvider></ThemeProvider>;
}
