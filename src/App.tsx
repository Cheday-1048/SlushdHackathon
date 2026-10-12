import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/app-shell';
import { DashboardPage } from './pages/dashboard';
import { useTheme } from '@/design-system/theme-context';
import { ThemeProvider } from '@/design-system/theme-provider';
import { BackgroundProvider } from '@/shared/components/layout/background-provider';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';

/** Motion for React follows the OS preference, or always reduces when the user chose "Reduce motion". */
function Motion({ children }: { children: ReactNode }) {
  const { motionPreference } = useTheme();
  return <MotionConfig reducedMotion={motionPreference === 'reduced' ? 'always' : 'user'}>{children}</MotionConfig>;
}

export function App() {
  return <ThemeProvider><BackgroundProvider><Motion><AppShell><Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="*" element={<Card className="items-start gap-3 p-8"><h2 className="text-2xl font-semibold">Page not found</h2><p className="text-muted-foreground">This page is not available in Phase 04.</p><Button asChild><Link to="/dashboard">Back to dashboard</Link></Button></Card>} />
  </Routes></AppShell></Motion></BackgroundProvider></ThemeProvider>;
}
