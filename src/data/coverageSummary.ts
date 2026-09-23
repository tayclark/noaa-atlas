// Pure helper turning a raw Coverage geometry into a human-readable bbox summary (#30). No
// existing code did this — coverage is authored/stored as WGS84 GeoJSON, unreadable as-is in a
// detail panel. Deliberately just a bbox (no region naming/antimeridian handling), matching
// coverageLookup.ts's precedent of staying minimal until a future issue needs more.

import type { Coverage } from './graphSchema'

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

function coverageBbox(coverage: Coverage): [number, number, number, number] {
  const rings = coverage.type === 'Polygon' ? coverage.coordinates : coverage.coordinates.flat()
  const bboxes = rings.map(ringBbox)
  const west = Math.min(...bboxes.map((b) => b[0]))
  const south = Math.min(...bboxes.map((b) => b[1]))
  const east = Math.max(...bboxes.map((b) => b[2]))
  const north = Math.max(...bboxes.map((b) => b[3]))
  return [west, south, east, north]
}

function formatLon(lon: number): string {
  return `${Math.abs(Math.round(lon))}°${lon < 0 ? 'W' : 'E'}`
}

function formatLat(lat: number): string {
  return `${Math.abs(Math.round(lat))}°${lat < 0 ? 'S' : 'N'}`
}

/** Formats a coverage geometry's bounding box as a human-readable lat/lon range, e.g. "~133°W–63°W, 22°N–74°N". */
export function summarizeCoverage(coverage: Coverage): string {
  const [west, south, east, north] = coverageBbox(coverage)
  return `~${formatLon(west)}–${formatLon(east)}, ${formatLat(south)}–${formatLat(north)}`
}
