// Where the globe should fly for a set of coverage geometries (#149). A plain min/max bbox broke
// for any coverage that touches both sides of the antimeridian (Guam, the Aleutians, worldwide):
// it came out as lon -180..180 and fitBounds centred the globe on Europe. This picks the smallest
// longitude arc instead, and treats near-global coverage as "global" so the caller can keep a
// US-centred view. Pure, so it's unit-tested (MapLibreGlobe.tsx is covered by e2e only).

import type { Coverage } from '../../data/graphSchema'

export type Bounds = [west: number, south: number, east: number, north: number]
export type FlyTarget = { kind: 'bounds'; bounds: Bounds } | { kind: 'global' }

/** Polygons smaller than this share of the total area only widen the view, so they're left out of framing (still drawn).
 * 5% keeps the US territories' EEZs (Guam's is ~4% of nws-api's coverage) from pulling the camera out to the Pacific (#163). */
const MIN_AREA_SHARE = 0.05
/** Coverage leaving a gap narrower than this (degrees of longitude) is treated as global. */
const MIN_GAP_DEGREES = 60
/** Wider bounds (degrees of longitude) can't be framed on a globe: fitBounds zooms in on their middle instead.
 * GOES-East and GOES-West's views (~215°) still frame; the Pacific and Atlantic tsunami basins (~277°) don't (#170). */
const MAX_FRAMED_SPAN = 240

interface Box {
  west: number
  south: number
  east: number
  north: number
  area: number
}

function polygonBox(rings: readonly (readonly (readonly [number, number])[])[]): Box {
  const outer = rings[0] ?? []
  const lons = outer.map(([lon]) => lon)
  const lats = outer.map(([, lat]) => lat)
  const [west, east, south, north] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)]
  // Rough spherical area: degrees² shrunk by cos(mid-latitude). Only used to rank polygons.
  const area = (east - west) * (north - south) * Math.cos((((south + north) / 2) * Math.PI) / 180)
  return { west, south, east, north, area }
}

/** Fly target covering every given geometry, or null when there is nothing to frame. */
export function coverageFlyTarget(coverages: readonly Coverage[]): FlyTarget | null {
  const boxes = coverages.flatMap((c) => (c.type === 'Polygon' ? [polygonBox(c.coordinates)] : c.coordinates.map(polygonBox)))
  if (boxes.length === 0) return null

  const total = boxes.reduce((sum, b) => sum + b.area, 0)
  const kept = boxes.filter((b) => b.area >= total * MIN_AREA_SHARE)

  // Merge the longitude intervals, then find the widest gap between them, going round the circle.
  const intervals = kept.map((b) => [b.west, b.east] as [number, number]).sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [west, east] of intervals) {
    const last = merged[merged.length - 1]
    if (last && west <= last[1]) last[1] = Math.max(last[1], east)
    else merged.push([west, east])
  }
  const first = merged[0] as [number, number]
  const last = merged[merged.length - 1] as [number, number]
  // The gap that wraps from the last interval's east edge over the antimeridian to the first's west edge.
  let gap = first[0] + 360 - last[1]
  let west = first[0]
  let east = last[1]
  for (let i = 0; i + 1 < merged.length; i++) {
    const [, gapStart] = merged[i] as [number, number]
    const [gapEnd] = merged[i + 1] as [number, number]
    if (gapEnd - gapStart > gap) {
      gap = gapEnd - gapStart
      // Everything outside this gap: from its far side, round through the antimeridian, back to its near side.
      west = gapEnd
      east = gapStart + 360
    }
  }
  if (gap < MIN_GAP_DEGREES || east - west > MAX_FRAMED_SPAN) return { kind: 'global' }

  const south = Math.min(...kept.map((b) => b.south))
  const north = Math.max(...kept.map((b) => b.north))
  return { kind: 'bounds', bounds: [west, south, east, north] }
}
