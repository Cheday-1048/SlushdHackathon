import { useEffect, useRef } from 'react'

/** Moves focus to an element when it mounts, so keyboard and screen-reader users land in context after navigation. */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return ref
}
