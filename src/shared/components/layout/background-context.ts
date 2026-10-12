import { createContext, useContext } from 'react'

export type BackgroundVariant = 'gradient' | 'static' | 'video'

export interface BackgroundSettings {
  variant: BackgroundVariant
  /** 0–1 */
  grain: number
  /** 0–1 */
  glow: number
  /** Disables drifting animation (the system reduced-motion preference always wins). */
  animated: boolean
  /** Used only when variant === 'video'. Provide WebM/MP4 exports (e.g. from After Effects). */
  videoSrc?: string
  /** Shown while the video loads, when it fails, or when reduced motion is preferred. */
  posterSrc?: string
}

export const defaultBackgroundSettings: BackgroundSettings = {
  variant: 'gradient',
  grain: 0.18,
  glow: 0.35,
  animated: true,
}

export interface BackgroundContextValue {
  settings: BackgroundSettings
  update: (patch: Partial<BackgroundSettings>) => void
}

export const BackgroundContext = createContext<BackgroundContextValue | null>(null)

export function useBackgroundSettings(): BackgroundContextValue {
  const ctx = useContext(BackgroundContext)
  if (!ctx) throw new Error('useBackgroundSettings must be used within <BackgroundProvider>')
  return ctx
}
