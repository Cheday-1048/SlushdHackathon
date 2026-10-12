import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'

function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-soft backdrop-blur-xl', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />
}

function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-lg leading-tight font-semibold', className)} {...props} />
}

function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-4', className)} {...props} />
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-3', className)} {...props} />
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
