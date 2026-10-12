import type { Transition, Variants } from 'motion/react'

/*
 * Motion configuration for Motion for React.
 * Keep these in sync with --duration-* / --ease-soft in tokens.css.
 */
export const duration = { fast: 0.15, base: 0.25, slow: 0.5 } as const

export const easeOut = [0.22, 1, 0.36, 1] as const

export const transition: Record<'fast' | 'base' | 'slow', Transition> = {
  fast: { duration: duration.fast, ease: easeOut },
  base: { duration: duration.base, ease: easeOut },
  slow: { duration: duration.slow, ease: easeOut },
}

export const spring: Transition = { type: 'spring', stiffness: 320, damping: 28 }

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: transition.slow },
}

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}
