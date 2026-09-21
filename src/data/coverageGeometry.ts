import { z } from 'zod'
// Explicit .ts extension so scripts/coverage-geometry.ts can run this under Node's native TS support.
import { coverageSchema, type Coverage } from './graphSchema.ts'

type Ring = number[][]
type PolygonCoords = Ring[]
export type SourceGeometry =
  | { type: 'Polygon'; coordinates: PolygonCoords }
  | { type: 'MultiPolygon'; coordinates: PolygonCoords[] }

/** [west, south, east, north] */
export type Bbox = readonly [number, number, number, number]

/** Per-geometry size target in bytes of minified JSON; keeps ~40 nodes well under 200 KB of graph.json. */
export const DEFAULT_MAX_BYTES = 4096

const round3 = (n: number) => Math.round(n * 1000) / 1000
const clamp = (n: number, limit: number) => Math.min(limit, Math.max(-limit, n))

/** Rounds to 3 decimals and clamps to valid WGS84 ranges. */
export function roundPosition([lon, lat]: number[]): [number, number] {
  return [round3(clamp(lon, 180)), round3(clamp(lat, 90))]
}

/** Returns the ring with its first position repeated at the end when it is not already closed. */
export function closeRing(ring: number[][]): number[][] {
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

function perpendicularDistance(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.hypot(dx, dy)
}

/** Douglas-Peucker over an open polyline; keeps both endpoints. Tolerance is in degrees. */
function simplifyLine(points: number[][], tolerance: number): number[][] {
  if (points.length < 3) return points
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    let maxDistance = 0
    let index = -1
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end])
      if (d > maxDistance) {
        maxDistance = d
        index = i
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = true
      stack.push([start, index], [index, end])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * Simplifies, rounds and closes a ring. Returns null when fewer than 3 distinct
 * positions survive, so callers can drop degenerate rings.
 */
export function simplifyRing(ring: number[][], tolerance: number): number[][] | null {
  const open = closeRing(ring).slice(0, -1)
  if (open.length < 3) return null
  // Split at the farthest point from the start so both halves are simplified as open lines.
  let far = 1
  let farDistance = -1
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1])
    if (d > farDistance) {
      farDistance = d
      far = i
    }
  }
  const simplified = [
    ...simplifyLine(open.slice(0, far + 1), tolerance).slice(0, -1),
    ...simplifyLine([...open.slice(far), open[0]], tolerance).slice(0, -1),
  ]
  const rounded: number[][] = []
  for (const p of simplified.map(roundPosition)) {
    const prev = rounded[rounded.length - 1]
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) rounded.push(p)
  }
  const first = rounded[0]
  const last = rounded[rounded.length - 1]
  if (rounded.length > 1 && first[0] === last[0] && first[1] === last[1]) rounded.pop()
  return rounded.length < 3 ? null : closeRing(rounded)
}

function simplifyPolygon(polygon: PolygonCoords, tolerance: number): PolygonCoords | null {
  const [outer, ...holes] = polygon.map((ring) => simplifyRing(ring, tolerance))
  if (!outer) return null
  return [outer, ...holes.filter((h): h is number[][] => h !== null)]
}

const polygonsOf = (geometry: SourceGeometry): PolygonCoords[] =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates

/** Simplifies at `tolerance` degrees, rounds to 3 decimals, closes rings and validates against the graph schema. */
export function processGeometry(geometry: SourceGeometry, tolerance: number): Coverage {
  const polygons = polygonsOf(geometry)
    .map((polygon) => simplifyPolygon(polygon, tolerance))
    .filter((p): p is PolygonCoords => p !== null)
  if (polygons.length === 0) throw new Error('No polygons left after simplification; lower the tolerance')
  const candidate = polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons }
  const result = coverageSchema.safeParse(candidate)
  if (!result.success) throw new Error(`Invalid coverage geometry:\n${z.prettifyError(result.error)}`)
  return result.data
}

export const byteSize = (coverage: Coverage): number => new TextEncoder().encode(JSON.stringify(coverage)).length

export interface FitResult {
  coverage: Coverage
  bytes: number
  tolerance: number
  withinTarget: boolean
}

/** Doubles the tolerance from `startTolerance` until the output fits in `maxBytes` (or the tolerance passes 10 degrees). */
export function fitGeometry(geometry: SourceGeometry, maxBytes: number, startTolerance = 0.005): FitResult {
  let tolerance = startTolerance
  let best: FitResult | null = null
  while (tolerance <= 10) {
    let coverage: Coverage
    try {
      coverage = processGeometry(geometry, tolerance)
    } catch (error) {
      if (best) break
      throw error
    }
    const bytes = byteSize(coverage)
    best = { coverage, bytes, tolerance, withinTarget: bytes <= maxBytes }
    if (best.withinTarget) return best
    tolerance *= 2
  }
  if (!best) throw new Error('Could not produce a geometry')
  return best
}

/** Rectangle polygon (counter-clockwise, closed) for a bbox. */
export function bboxPolygon([west, south, east, north]: Bbox): PolygonCoords {
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ]
}

const centroidOfBbox = (polygon: PolygonCoords): [number, number] => {
  const lons = polygon[0].map((p) => p[0])
  const lats = polygon[0].map((p) => p[1])
  return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
}

/** Keeps the polygons of a geometry whose bounding-box centre falls inside any of the given bboxes. */
export function selectPolygons(geometry: SourceGeometry, bboxes: readonly Bbox[]): SourceGeometry {
  const kept = polygonsOf(geometry).filter((polygon) => {
    const [lon, lat] = centroidOfBbox(polygon)
    return bboxes.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n)
  })
  if (kept.length === 0) throw new Error('No polygons matched the selection')
  return { type: 'MultiPolygon', coordinates: kept }
}

/** Pulls every polygon out of a GeoJSON Geometry, Feature or FeatureCollection into one MultiPolygon. */
export function extractPolygons(geojson: unknown): SourceGeometry {
  const polygons: PolygonCoords[] = []
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const n = node as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[]; geometries?: unknown[] }
    if (n.type === 'Polygon') polygons.push(n.coordinates as PolygonCoords)
    else if (n.type === 'MultiPolygon') polygons.push(...(n.coordinates as PolygonCoords[]))
    else if (n.type === 'Feature') visit(n.geometry)
    else if (n.type === 'FeatureCollection') n.features?.forEach(visit)
    else if (n.type === 'GeometryCollection') n.geometries?.forEach(visit)
  }
  visit(geojson)
  if (polygons.length === 0) throw new Error('Input contains no Polygon or MultiPolygon geometry')
  return { type: 'MultiPolygon', coordinates: polygons }
}

export interface Preset {
  description: string
  /** Natural Earth ADM0_A3 code to pull polygons from; omitted for hand-defined presets. */
  country?: string
  /** Keep only polygons whose bbox centre lies in one of these (country presets). */
  select?: readonly Bbox[]
  /** Hand-defined rectangles (presets with no source data). */
  boxes?: readonly Bbox[]
}

export const PRESETS: Record<string, Preset> = {
  'contiguous-us': { description: 'Lower 48 states from Natural Earth', country: 'USA', select: [[-125, 24, -66, 50]] },
  alaska: { description: 'Alaska including the Aleutians, from Natural Earth', country: 'USA', select: [[-170, 50, -129, 72], [170, 50, 180, 56]] },
  hawaii: { description: 'Hawaiian islands from Natural Earth', country: 'USA', select: [[-161, 18, -154, 23]] },
  'us-coastal-waters': {
    description: 'Approximate 200 nmi boxes around US coasts (hand-defined, not an official boundary)',
    boxes: [
      [-133, 22, -63, 50],
      [-180, 48, -125, 74],
      [170, 48, 180, 58],
      [-165, 15, -150, 25],
      [-69, 16, -63, 20],
    ],
  },
  worldwide: { description: 'Full-world polygon', boxes: [[-180, -90, 180, 90]] },
}

/** Builds the source geometry for a hand-defined preset. */
export function boxesGeometry(boxes: readonly Bbox[]): SourceGeometry {
  return { type: 'MultiPolygon', coordinates: boxes.map(bboxPolygon) }
}
