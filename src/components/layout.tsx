import { BarChart3, Bot, FlaskConical, LayoutDashboard, Split, Store } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

const futureSections = [
  { label: 'Simulation Lab', icon: FlaskConical },
  { label: 'AI Assistant', icon: Bot },
  { label: 'A/B Testing', icon: Split },
];

export function Layout({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><Store size={24} aria-hidden="true" /><span>Retail Decision Lab</span></div>
      <p className="muted small sidebar-caption">Business workspace</p>
      <nav aria-label="Main navigation">
        <NavLink to="/dashboard" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><LayoutDashboard size={18} aria-hidden="true" />Dashboard</NavLink>
        <Link to="/dashboard#analytics" className="nav-item" onClick={() => document.getElementById('analytics')?.scrollIntoView()}><BarChart3 size={18} aria-hidden="true" />Analytics</Link>
        {futureSections.map(({ label, icon: Icon }) => <button className="nav-item future-item" key={label} disabled title="Planned for a future phase"><Icon size={18} aria-hidden="true" /><span>{label}</span><span className="planned">Planned</span></button>)}
      </nav>
      <div className="phase-note"><strong>Phase 04</strong><p className="muted small">Dashboard and analytics<br />Synthetic business data</p></div>
    </aside>
    <main id="main-content" className="main-content">{children}</main>
  </div>;
}
