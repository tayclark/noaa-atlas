// A media query read through useSyncExternalStore (#78), for the few layout facts that CSS alone
// can't give the code, such as whether a phone is held on its side.

import { useCallback, useSyncExternalStore } from 'react'

// jsdom (the unit-test environment) has no matchMedia, so a query never matches there.
const media = (query: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null)

export function useMediaQuery(query: string): boolean {
  // Stable per query: a new subscribe function on each render would make React unsubscribe and
  // subscribe again every time (#352).
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = media(query)
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => media(query)?.matches ?? false, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
