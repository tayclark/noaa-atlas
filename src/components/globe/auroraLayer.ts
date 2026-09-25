// Pure helpers for the SWPC aurora heatmap (#54). Kept out of MapLibreGlobe.tsx so the grid
// conversion, heatmap styling and click lookup are unit-testable, as with nwsAlertsLayer.ts.

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { SwpcOvation } from '../../data/swpcSchema'
import { SwpcHttpError, SwpcParseError } from '../../data/swpcClient'

/** Cells below this probability (%) are left off the map and out of the click popup. */
export const AURORA_MIN_VALUE = 1

// Declared locally rather than imported from 'geojson' (see Footprint in selectionGlobeView.ts).
export interface AuroraPoints {
  type: 'FeatureCollection'
  features: { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: { aurora: number } }[]
}

/** OVATION longitudes run 0..359; MapLibre wants -180..180. */
export function wrapLongitude(lon: number): number {
  return lon > 180 ? lon - 360 : lon
}

/**
 * The grid as heatmap points. About two thirds of OVATION's 65,160 cells are zero at any time,
 * and drawing them only costs the GPU, so they're dropped.
 */
export function auroraToGeoJson(ovation: SwpcOvation, minValue = AURORA_MIN_VALUE): AuroraPoints {
  return {
    type: 'FeatureCollection',
    features: ovation.coordinates
      .filter(([, , aurora]) => aurora >= minValue)
      .map(([lon, lat, aurora]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [wrapLongitude(lon), lat] },
        properties: { aurora },
      })),
  }
}

// SWPC's own aurora dashboard ramps green → yellow → red with probability; this follows it, and
// stays transparent at zero density so the basemap shows through outside the oval.
const HEATMAP_COLOR: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['heatmap-density'],
  0,
  'rgba(46, 204, 113, 0)',
  0.05,
  'rgba(46, 204, 113, 0.35)',
  0.2,
  'rgba(46, 204, 113, 0.8)',
  0.5,
  'rgb(241, 196, 15)',
  0.8,
  'rgb(231, 76, 60)',
]
const HEATMAP_INTENSITY = 0.55

/**
 * Heatmap paint. The radius is in screen pixels, so it grows with zoom (base 2, like the map's
 * scale) to stay about two grid cells on the ground: any narrower and the 1° rows show as stripes.
 * Weight is the probability itself, and the intensity is tuned so a uniform field's density is
 * close to it, so the colour reads as probability (green below ~20%, yellow ~50%, red 80%+)
 * rather than as how many points overlap.
 */
export function auroraHeatmapPaint(opacity: number) {
  return {
    'heatmap-weight': ['interpolate', ['linear'], ['get', 'aurora'], 0, 0, 100, 1] as ExpressionSpecification,
    'heatmap-intensity': HEATMAP_INTENSITY,
    'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, 3, 6, 192] as ExpressionSpecification,
    'heatmap-color': HEATMAP_COLOR,
    'heatmap-opacity': opacity,
  }
}

const lookupCache = new WeakMap<SwpcOvation, Map<string, number>>()

function lookupFor(ovation: SwpcOvation): Map<string, number> {
  let lookup = lookupCache.get(ovation)
  if (!lookup) {
    lookup = new Map(ovation.coordinates.map(([lon, lat, aurora]) => [`${lon},${lat}`, aurora]))
    lookupCache.set(ovation, lookup)
  }
  return lookup
}

/**
 * The aurora probability (%) at the grid cell nearest a clicked point, or null when it's below
 * `minValue` or off the grid. A heatmap can't be hit-tested with queryRenderedFeatures, so the
 * click popup reads the grid directly.
 */
export function auroraAt(ovation: SwpcOvation, [lng, lat]: readonly [number, number], minValue = AURORA_MIN_VALUE): number | null {
  const lon = ((Math.round(lng) % 360) + 360) % 360
  const value = lookupFor(ovation).get(`${lon},${Math.round(lat)}`)
  return value !== undefined && value >= minValue ? value : null
}

/** "01:22 UTC" from an ISO timestamp. */
export function formatUtcTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(11, 16)} UTC`
}

export function formatAuroraPopupHtml(value: number, forecastTime: string): string {
  return `<strong>Aurora</strong>: ${value}% chance here <span style="opacity: 0.7">(forecast for ${formatUtcTime(forecastTime)})</span>`
}

/** A short message for a failed OVATION or Kp fetch, shown in the space weather readout. */
export function describeSwpcFetchOutcome(err: unknown): string {
  if (err instanceof SwpcHttpError) return `SWPC is unavailable (${err.status}) — space weather could not be loaded.`
  if (err instanceof SwpcParseError) return 'SWPC returned an unexpected response.'
  return 'Could not reach SWPC for space weather.'
}
