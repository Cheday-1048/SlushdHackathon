import { createContext, useContext } from 'react'
import type { AccentId } from './accents'

/** The theme actually applied. */
export type Theme = 'light' | 'dark'
/** What the user chose; 'system' follows the OS. */
export type ThemePreference = Theme | 'system'
export type Density = 'comfortable' | 'compact'
/** 'system' defers to prefers-reduced-motion; 'reduced' always minimizes motion. */
export type MotionPreference = 'system' | 'reduced'

export interface ThemeContextValue {
  /** Resolved theme (never 'system'). */
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
  accent: AccentId
  setAccent: (accent: AccentId) => void
  density: Density
  setDensity: (density: Density) => void
  motionPreference: MotionPreference
  setMotionPreference: (motion: MotionPreference) => void
}

export const THEME_STORAGE_KEY = 'hui-theme'
export const ACCENT_STORAGE_KEY = 'hui-accent'
export const DENSITY_STORAGE_KEY = 'hui-density'
export const MOTION_STORAGE_KEY = 'hui-motion'
export const DEFAULT_THEME: ThemePreference = 'light'

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}
