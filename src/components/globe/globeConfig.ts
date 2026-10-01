// Dark basemap decided in #11 (OpenFreeMap, no API key/usage cap required).
export const GLOBE_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

// Continental US center, chosen so the globe opens focused on the US per #36.
export const US_CENTER: [number, number] = [-98.5, 39.8]
export const US_ZOOM = 3

export const GLOBE_PROJECTION = { type: 'globe' } as const

// The contiguous US is about 58 degrees of longitude wide, so with a little air around it.
const US_LONGITUDE_SPAN = 62
// MapLibre's world is 512 * 2^zoom px around.
const WORLD_PX_AT_ZOOM_0 = 512
// A map this wide or wider opens at US_ZOOM (the desktop pane at a 1280px window is about 637px, and
// a bit of that is the divider); a narrower one zooms out to fit.
const US_ZOOM_MIN_WIDTH = 600
const MIN_OPENING_ZOOM = 1.5

/**
 * The zoom the globe opens at in a container `width` px wide (#78). US_ZOOM was chosen for the
 * desktop pane; on a 390px phone it shows only 34 degrees of longitude, so both coasts are cropped.
 * Narrower containers zoom out until the contiguous US fits across them.
 */
export function openingZoom(width: number): number {
  if (width >= US_ZOOM_MIN_WIDTH) return US_ZOOM
  const fitsUs = Math.log2((width * 360) / (US_LONGITUDE_SPAN * WORLD_PX_AT_ZOOM_0))
  return Math.min(US_ZOOM, Math.max(MIN_OPENING_ZOOM, fitsUs))
}
