// Compact layout (#78): the globe, finder and graph are tabs of their own instead of a split. That
// is a phone held upright (700px wide or less) or on its side (a short touch screen), so rotating
// one never swaps layouts.

import { useMediaQuery } from './useMediaQuery'

export const NARROW_LAYOUT_QUERY = '(max-width: 700px), (max-height: 500px) and (pointer: coarse)'

/** True while the compact (phone) layout applies. jsdom has no matchMedia, so the layout stays wide there. */
export function useNarrowLayout(): boolean {
  return useMediaQuery(NARROW_LAYOUT_QUERY)
}
