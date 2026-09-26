// Phone-width layout (#78): below this width the globe gets its own tab instead of half the
// screen. A module-level media query read through useSyncExternalStore, like the app's stores.

import { useSyncExternalStore } from 'react'

export const NARROW_LAYOUT_QUERY = '(max-width: 700px)'

// jsdom (the unit-test environment) has no matchMedia, so the layout stays wide there.
const media = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_LAYOUT_QUERY) : null)

function subscribe(onChange: () => void): () => void {
  const query = media()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

const getSnapshot = () => media()?.matches ?? false

/** True while the viewport is phone-width. */
export function useNarrowLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
