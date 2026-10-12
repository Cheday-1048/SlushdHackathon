import type { LucideIcon } from 'lucide-react';

export function KpiCard({ label, value, icon: Icon, description = 'Synthetic data' }: { label: string; value: string; icon: LucideIcon; description?: string }) {
  return <article className="card kpi-card" aria-label={label}>
    <div className="kpi-label"><span>{label}</span><Icon size={18} aria-hidden="true" /></div>
    <p className="kpi-value">{value}</p>
    <p className="muted small">{description}</p>
  </article>;
}
