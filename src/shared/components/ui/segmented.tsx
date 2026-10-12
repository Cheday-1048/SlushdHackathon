import { cn } from '@/shared/lib/utils'

interface SegmentedProps<V extends string | number> {
  label: string
  value: V
  onChange: (value: V) => void
  options: { value: V; label: string }[]
  size?: 'sm' | 'md'
  className?: string
}

/** Pill-style single choice built from aria-pressed buttons. */
export function Segmented<V extends string | number>({ label, value, onChange, options, size = 'md', className }: SegmentedProps<V>) {
  return (
    <div role="group" aria-label={label} className={cn('flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-muted/80 p-1', className)}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'shrink-0 rounded-lg px-3 font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow] duration-(--duration-base) focus-visible:ring-[3px] focus-visible:ring-ring/40',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
            value === option.value ? 'bg-surface text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
