// Pure helper turning a raw Coverage geometry into a human-readable bbox summary (#30). No
// existing code did this — coverage is authored/stored as WGS84 GeoJSON, unreadable as-is in a
// detail panel. Just a bbox (no region naming), but the longitude range is the smallest arc, so coverage
// crossing the antimeridian reads "~150°E–130°W" rather than "180°W–180°E" (#80).

import type { Coverage } from './graphSchema'
import { smallestLonArc, wrapLon } from './lonArc'

function ringBbox(ring: readonly (readonly [number, number])[]): [number, number, number, number] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lon, lat] of ring) {
    if (lon < west) west = lon
    if (lon > east) east = lon
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  return [west, south, east, north]
}

/** Longitude gaps narrower than this (degrees) count as covering every longitude. */
const FULL_CIRCLE_GAP = 5

export function coverageBbox(coverage: Coverage): [number, number, number, number] {
  const rings = coverage.type === 'Polygon' ? coverage.coordinates : coverage.coordinates.flat()
  const bboxes = rings.map(ringBbox)
  const arc = smallestLonArc(bboxes.map((b) => [b[0], b[2]] as const))
  const south = Math.min(...bboxes.map((b) => b[1]))
  const north = Math.max(...bboxes.map((b) => b[3]))
  // `east` exceeds 180 when the coverage crosses the antimeridian (#80).
  return [arc?.west ?? 0, south, arc?.east ?? 0, north]
}

function formatLon(lon: number): string {
  const wrapped = wrapLon(lon > 180 ? lon - 360 : lon)
  return `${Math.abs(Math.round(wrapped))}°${wrapped < 0 ? 'W' : 'E'}`
}

function formatLat(lat: number): string {
  return `${Math.abs(Math.round(lat))}°${lat < 0 ? 'S' : 'N'}`
}

/** Formats a coverage geometry's bounding box as a human-readable lat/lon range, e.g. "~133°W–63°W, 22°N–74°N". */
export function summarizeCoverage(coverage: Coverage): string {
  const [west, south, east, north] = coverageBbox(coverage)
  const lats = `${formatLat(south)}–${formatLat(north)}`
  if (east - west >= 360 - FULL_CIRCLE_GAP) return `all longitudes, ${lats}`
  return `~${formatLon(west)}–${formatLon(east)}, ${lats}`
}
