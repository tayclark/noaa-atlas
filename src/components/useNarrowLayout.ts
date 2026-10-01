// Compact layout (#78): the globe, finder and graph are tabs of their own instead of a split. That
// is a phone held upright (700px wide or less) or on its side (a short touch screen), so rotating
// one never swaps layouts. A module-level media query read through useSyncExternalStore, like the
// app's stores.

import { useSyncExternalStore } from 'react'

export const NARROW_LAYOUT_QUERY = '(max-width: 700px), (max-height: 500px) and (pointer: coarse)'

// jsdom (the unit-test environment) has no matchMedia, so the layout stays wide there.
const media = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_LAYOUT_QUERY) : null)

function subscribe(onChange: () => void): () => void {
  const query = media()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

const getSnapshot = () => media()?.matches ?? false

/** True while the compact (phone) layout applies. */
export function useNarrowLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
