// A media query read through useSyncExternalStore (#78), for the few layout facts that CSS alone
// can't give the code, such as whether a phone is held on its side.

import { useSyncExternalStore } from 'react'

// jsdom (the unit-test environment) has no matchMedia, so a query never matches there.
const media = (query: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null)

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = media(query)
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    () => media(query)?.matches ?? false,
    () => false,
  )
}
