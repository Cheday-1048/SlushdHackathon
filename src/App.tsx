import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout';
import { Button } from './components/ui/button';
import { Link } from 'react-router-dom';
import { DashboardPage } from './pages/dashboard';
import { SimulationLabPage } from './pages/simulation-lab';

export function App() {
  return <><a className="skip-link" href="#main-content">Skip to content</a><Layout><Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/simulation-lab" element={<SimulationLabPage key="simulation" />} />
    <Route path="/ai-assistant" element={<SimulationLabPage key="assistant" initialMode="assistant" />} />
    <Route path="*" element={<section className="card error-panel"><h1>Page not found</h1><p>This page is not available in Phase 08.</p><Button asChild><Link to="/dashboard">Back to dashboard</Link></Button></section>} />
  </Routes></Layout></>;
}
