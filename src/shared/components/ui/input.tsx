import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

/** Shared field chrome, also used by Textarea and SelectTrigger. Invalid state is driven by aria-invalid. */
export const fieldClass =
  'w-full rounded-xl border border-input bg-card px-3.5 text-sm text-foreground shadow-soft backdrop-blur transition-[border-color,box-shadow] duration-(--duration-base) outline-none placeholder:text-muted-foreground hover:border-ring/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/25'

function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(fieldClass, 'h-10', className)} {...props} />
}

export { Input }
