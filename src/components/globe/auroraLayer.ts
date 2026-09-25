// Pure helpers for the SWPC aurora layer (#54, #158). Kept out of MapLibreGlobe.tsx so the grid
// resampling, colouring and click lookup are unit-testable, as with nwsAlertsLayer.ts.

import type { SwpcOvation } from '../../data/swpcSchema'
import { SwpcHttpError, SwpcParseError } from '../../data/swpcClient'

/** Cells below this probability (%) are left out of the click popup and the drawn-cell count. */
export const AURORA_MIN_VALUE = 1

/** Web Mercator's latitude limit, which is as far as a MapLibre image or canvas source can reach. */
export const MERCATOR_MAX_LAT = 85.051129

/** Where the raster is pinned: the whole Mercator square, corners clockwise from the top left. */
export const AURORA_RASTER_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180, MERCATOR_MAX_LAT],
  [180, MERCATOR_MAX_LAT],
  [180, -MERCATOR_MAX_LAT],
  [-180, -MERCATOR_MAX_LAT],
]

/** The raster's width and height in pixels: two per degree of longitude. */
export const AURORA_RASTER_SIZE = 720

export interface AuroraRaster {
  width: number
  height: number
  /** RGBA, row by row from the top (north). */
  data: Uint8ClampedArray<ArrayBuffer>
  /** How many grid cells are at or above AURORA_MIN_VALUE, i.e. have any aurora to draw. */
  cells: number
}

// SWPC's own aurora dashboard ramps green → yellow → red with probability; this follows it, fading
// to transparent towards zero so the basemap shows through outside the oval. [probability %, r, g, b, alpha 0..1]
const COLOR_STOPS: readonly (readonly [number, number, number, number, number])[] = [
  [0, 46, 204, 113, 0],
  [5, 46, 204, 113, 0.35],
  [20, 46, 204, 113, 0.8],
  [50, 241, 196, 15, 1],
  [80, 231, 76, 60, 1],
]

/** The RGBA colour (alpha 0..255) for a probability, interpolated linearly between the stops. */
export function auroraColor(probability: number): [number, number, number, number] {
  const last = COLOR_STOPS[COLOR_STOPS.length - 1]
  if (probability >= last[0]) return [last[1], last[2], last[3], Math.round(last[4] * 255)]
  const i = Math.max(0, COLOR_STOPS.findIndex(([p]) => p > probability) - 1)
  const [p0, r0, g0, b0, a0] = COLOR_STOPS[i]
  const [p1, r1, g1, b1, a1] = COLOR_STOPS[i + 1]
  const t = Math.max(0, (probability - p0) / (p1 - p0))
  const mix = (from: number, to: number) => from + (to - from) * t
  return [Math.round(mix(r0, r1)), Math.round(mix(g0, g1)), Math.round(mix(b0, b1)), Math.round(mix(a0, a1) * 255)]
}

/** The latitude at the centre of raster row `row` of `height`, spaced evenly in Mercator y. */
export function mercatorRowLatitude(row: number, height: number): number {
  const y = Math.PI * (1 - (2 * (row + 0.5)) / height)
  return (Math.atan(Math.sinh(y)) * 180) / Math.PI
}

/**
 * The grid as a Web Mercator image, coloured by probability. A heatmap can't do this: its colour
 * is point density in screen pixels, so the 1° rows striped, faded and fell apart into blobs as
 * they spread apart towards the pole and with zoom (#158). Here each pixel is the grid bilinearly
 * interpolated at that pixel's longitude and latitude, and MapLibre's linear resampling keeps it
 * smooth however far in the map zooms.
 */
export function auroraRaster(ovation: SwpcOvation, size = AURORA_RASTER_SIZE): AuroraRaster {
  // OVATION's grid: longitude 0..359, latitude -90..90, 1° apart. Missing cells read as zero.
  const grid = new Float32Array(360 * 181)
  let cells = 0
  for (const [lon, lat, aurora] of ovation.coordinates) {
    grid[(lat + 90) * 360 + lon] = aurora
    if (aurora >= AURORA_MIN_VALUE) cells++
  }

  const data = new Uint8ClampedArray(size * size * 4)
  for (let row = 0; row < size; row++) {
    const gy = mercatorRowLatitude(row, size) + 90
    const y0 = Math.floor(gy)
    const y1 = Math.min(y0 + 1, 180)
    const fy = gy - y0
    for (let col = 0; col < size; col++) {
      // -180..180 wrapped onto 0..360, so the cells either side of the antimeridian blend.
      const gx = ((-180 + ((col + 0.5) * 360) / size) % 360 + 360) % 360
      const x0 = Math.floor(gx)
      const x1 = (x0 + 1) % 360
      const fx = gx - x0
      const top = grid[y0 * 360 + x0] * (1 - fx) + grid[y0 * 360 + x1] * fx
      const bottom = grid[y1 * 360 + x0] * (1 - fx) + grid[y1 * 360 + x1] * fx
      data.set(auroraColor(top * (1 - fy) + bottom * fy), (row * size + col) * 4)
    }
  }
  return { width: size, height: size, data, cells }
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
 * `minValue` or off the grid. A raster layer can't be hit-tested with queryRenderedFeatures, so
 * the click popup reads the grid directly.
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
