import { useSyncExternalStore } from 'react'

// Returns false during SSR and the first client render, true after mount.
// Lets a client component defer browser-only rendering (local timezone,
// tooltips) past hydration without a setState-in-effect.
const subscribe = () => () => {}

export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
