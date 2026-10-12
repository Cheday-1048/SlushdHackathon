import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'
import { fieldClass } from './input'

/** Browser-native <select> with the shared field chrome (keeps native keyboard, form and assistive-technology behavior). */
function NativeSelect({ className, wrapperClassName, children, ...props }: ComponentProps<'select'> & { wrapperClassName?: string }) {
  return (
    <span className={cn('relative inline-flex w-full', wrapperClassName)}>
      <select className={cn(fieldClass, 'h-10 cursor-pointer appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-60" aria-hidden />
    </span>
  )
}

export { NativeSelect }
