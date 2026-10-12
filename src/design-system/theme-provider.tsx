import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { accentPresets, DEFAULT_ACCENT, type AccentId } from './accents'
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_THEME,
  DENSITY_STORAGE_KEY,
  MOTION_STORAGE_KEY,
  THEME_STORAGE_KEY,
  ThemeContext,
  type Density,
  type MotionPreference,
  type Theme,
  type ThemePreference,
} from './theme-context'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored && (allowed as readonly string[]).includes(stored)) return stored as T
  } catch {
    /* storage unavailable */
  }
  return fallback
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

const darkQuery = '(prefers-color-scheme: dark)'
const subscribeSystemDark = (cb: () => void) => {
  const mq = window.matchMedia(darkQuery)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getSystemDark = () => window.matchMedia(darkQuery).matches

const accentIds = accentPresets.map((a) => a.id)

/** Single source of truth for theme, accent, density and motion preference. Writes attributes on <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStored(THEME_STORAGE_KEY, ['light', 'dark', 'system'], DEFAULT_THEME))
  const [accent, setAccentState] = useState<AccentId>(() => readStored(ACCENT_STORAGE_KEY, accentIds, DEFAULT_ACCENT))
  const [density, setDensityState] = useState<Density>(() => readStored(DENSITY_STORAGE_KEY, ['comfortable', 'compact'], 'comfortable'))
  const [motionPreference, setMotionState] = useState<MotionPreference>(() => readStored(MOTION_STORAGE_KEY, ['system', 'reduced'], 'system'))
  const systemDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false)

  const theme: Theme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    if (accent === DEFAULT_ACCENT) delete root.dataset.accent
    else root.dataset.accent = accent
    if (density === 'comfortable') delete root.dataset.density
    else root.dataset.density = density
    if (motionPreference === 'system') delete root.dataset.motionPref
    else root.dataset.motionPref = motionPreference
  }, [theme, accent, density, motionPreference])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    writeStored(THEME_STORAGE_KEY, next)
  }, [])
  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next)
    writeStored(ACCENT_STORAGE_KEY, next)
  }, [])
  const setDensity = useCallback((next: Density) => {
    setDensityState(next)
    writeStored(DENSITY_STORAGE_KEY, next)
  }, [])
  const setMotionPreference = useCallback((next: MotionPreference) => {
    setMotionState(next)
    writeStored(MOTION_STORAGE_KEY, next)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme: setPreference,
      toggleTheme: () => setPreference(theme === 'dark' ? 'light' : 'dark'),
      preference,
      setPreference,
      accent,
      setAccent,
      density,
      setDensity,
      motionPreference,
      setMotionPreference,
    }),
    [theme, preference, accent, density, motionPreference, setPreference, setAccent, setDensity, setMotionPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
