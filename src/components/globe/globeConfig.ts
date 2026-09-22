// Dark basemap decided in #11 (OpenFreeMap, no API key/usage cap required).
export const GLOBE_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

// Continental US center, chosen so the globe opens focused on the US per #36.
export const US_CENTER: [number, number] = [-98.5, 39.8]
export const US_ZOOM = 3

export const GLOBE_PROJECTION = { type: 'globe' } as const
