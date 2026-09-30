// Where the globe should fly for a set of coverage geometries (#149). A plain min/max bbox broke
// for any coverage that touches both sides of the antimeridian (Guam, the Aleutians, worldwide):
// it came out as lon -180..180 and fitBounds centred the globe on Europe. This picks the smallest
// longitude arc instead, and treats near-global coverage as "global" so the caller can zoom
// out to the whole globe (#80). Pure, so it's unit-tested (MapLibreGlobe.tsx is covered by e2e only).

import type { Coverage } from '../../data/graphSchema'
import { smallestLonArc, wrapLon } from '../../data/lonArc'

export type Bounds = [west: number, south: number, east: number, north: number]
export type FlyTarget = { kind: 'bounds'; bounds: Bounds } | { kind: 'global'; center?: [lon: number, lat: number] }

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

  const arc = smallestLonArc(kept.map((b) => [b.west, b.east] as const))
  if (!arc) return null
  const { west, east, gap } = arc
  const south = Math.min(...kept.map((b) => b.south))
  const north = Math.max(...kept.map((b) => b.north))
  // Near-global coverage has no natural centre, so the caller keeps the current one. Coverage that is
  // merely too wide to frame (the tsunami basins) is centred on its own arc instead of the US.
  if (gap < MIN_GAP_DEGREES) return { kind: 'global' }
  if (east - west > MAX_FRAMED_SPAN) return { kind: 'global', center: [wrapLon((west + east) / 2), (south + north) / 2] }
  return { kind: 'bounds', bounds: [west, south, east, north] }
}
