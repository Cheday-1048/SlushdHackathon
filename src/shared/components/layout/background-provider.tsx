import { useMemo, useState, type ReactNode } from 'react'
import { BackgroundContext, defaultBackgroundSettings, type BackgroundSettings } from './background-context'

export function BackgroundProvider({
  initial,
  children,
}: {
  initial?: Partial<BackgroundSettings>
  children: ReactNode
}) {
  const [settings, setSettings] = useState<BackgroundSettings>({ ...defaultBackgroundSettings, ...initial })
  const value = useMemo(
    () => ({ settings, update: (patch: Partial<BackgroundSettings>) => setSettings((s) => ({ ...s, ...patch })) }),
    [settings],
  )
  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>
}
