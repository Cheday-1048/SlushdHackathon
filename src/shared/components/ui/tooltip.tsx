import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider

/** Convenience wrapper: `<Tooltip content="Label"><button/></Tooltip>`. Requires a TooltipProvider above. */
function Tooltip({ content, children, side = 'right', disabled }: { content: ReactNode; children: ReactNode; side?: ComponentProps<typeof TooltipPrimitive.Content>['side']; disabled?: boolean }) {
  if (disabled) return <>{children}</>
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className={cn('z-50 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lift data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0')}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip, TooltipProvider }
