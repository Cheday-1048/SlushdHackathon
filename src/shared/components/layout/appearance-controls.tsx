import { accentPresets } from '@/design-system/accents'
import { useTheme, type Density, type MotionPreference, type ThemePreference } from '@/design-system/theme-context'
import { cn } from '@/shared/lib/utils'

function Choice<V extends string>({ legend, value, onChange, options }: { legend: string; value: V; onChange: (v: V) => void; options: { value: V; label: string; swatch?: string }[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40',
              value === o.value ? 'border-ring bg-secondary text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {o.swatch && <span aria-hidden className="size-3 rounded-full border border-border" style={{ background: o.swatch }} />}
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Theme, accent, density and motion controls bound to the shared ThemeProvider (no local state). */
export function AppearanceControls({ className }: { className?: string }) {
  const { preference, setPreference, accent, setAccent, density, setDensity, motionPreference, setMotionPreference } = useTheme()
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Choice<ThemePreference>
        legend="Theme"
        value={preference}
        onChange={setPreference}
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
          { value: 'system', label: 'System' },
        ]}
      />
      <Choice legend="Accent" value={accent} onChange={setAccent} options={accentPresets.map((a) => ({ value: a.id, label: a.label, swatch: a.swatch }))} />
      <Choice<Density>
        legend="Density"
        value={density}
        onChange={setDensity}
        options={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ]}
      />
      <Choice<MotionPreference>
        legend="Motion"
        value={motionPreference}
        onChange={setMotionPreference}
        options={[
          { value: 'system', label: 'Follow system' },
          { value: 'reduced', label: 'Reduce motion' },
        ]}
      />
    </div>
  )
}
