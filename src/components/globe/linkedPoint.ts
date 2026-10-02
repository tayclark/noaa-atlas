// A point selected from outside the globe (#266): a shared link, or Back/Forward to one. The globe
// opens its own popup when it selects a point (a click, a station, an alert, "My location"), so a
// selected point with no popup over it came from elsewhere, and the globe frames it and looks it up.

import type { LonLat } from '../../data/coverageLookup'

// Close enough to frame a city and its forecast grid, without losing where on the globe it is.
export const LINKED_POINT_ZOOM = 6

// MapLibre may move a popup by whole turns of longitude to keep it on the visible copy of the world.
const sameLongitude = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) < 1e-6

/** Whether two positions are the same place, allowing for a longitude wrapped by 360 degrees. */
export function isSamePlace(a: LonLat, b: LonLat): boolean {
  return sameLongitude(a[0], b[0]) && Math.abs(a[1] - b[1]) < 1e-6
}

/** Whether the selected point needs the globe to frame and look it up, given the open popup's position. */
export function needsLinkedLookup(point: LonLat | null, popupAt: LonLat | null): point is LonLat {
  return point !== null && (popupAt === null || !isSamePlace(point, popupAt))
}
