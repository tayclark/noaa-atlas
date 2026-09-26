import { difference, intersection, union } from 'polyclip-ts'
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

/** A spherical cap: every point within `radius` degrees of great-circle distance of the centre. */
export interface Cap {
  lon: number
  lat: number
  radius: number
}

export interface Preset {
  description: string
  /** Natural Earth ADM0_A3 codes to pull land polygons from. */
  countries?: readonly string[]
  /** Keep only the country polygons whose bbox centre lies in one of these. */
  select?: readonly Bbox[]
  /** Marine Regions EEZ ids (`mrgid`) to add. */
  eez?: readonly number[]
  /** Natural Earth countries (ADM0_A3) to cut out, so water-only coverage ends at a smooth 1:50m
   *  coastline instead of the EEZ's inner edge, which runs up every river and estuary. */
  subtract?: readonly string[]
  /** Natural Earth lakes to add (after `subtract`), cut to the part inside the `within` country (ADM0_A3). */
  lakes?: { names: readonly string[]; within: string }
  /** Hand-defined rectangles. */
  boxes?: readonly Bbox[]
  /** Computed spherical caps, such as a geostationary satellite's view. */
  caps?: readonly Cap[]
  /** Cut the result to this rectangle. */
  clip?: Bbox
}

// US states and the inhabited territories: Puerto Rico, the US Virgin Islands, Guam, the Northern
// Mariana Islands and American Samoa.
const US_LAND = ['USA', 'PRI', 'VIR', 'GUM', 'MNP', 'ASM'] as const
// The 200 nmi EEZ of each of those (Marine Regions mrgid): the contiguous US, Alaska, Hawaii, then
// the territories in the order above. The remote Pacific atolls, the overlapping claims and the
// joint regime with Russia are left out.
const US_EEZ = [8456, 8463, 8453, 33179, 33180, 48957, 48980, 8444] as const
const GREAT_LAKES = { names: ['Lake Superior', 'Lake Michigan', 'Lake Huron', 'Lake Erie', 'Lake Ontario'], within: 'USA' } as const
// Where a geostationary satellite is at least 10° above the horizon (a local zenith angle under
// 80°): 71.4° of great-circle distance from the sub-satellite point, which takes in Alaska from
// GOES-West. Closer to the limb (81.3°) the view is too oblique to be useful.
const GEO_USEFUL_RADIUS = 71.4

export const PRESETS: Record<string, Preset> = {
  'contiguous-us': { description: 'Lower 48 states from Natural Earth', countries: ['USA'], select: [[-125, 24, -66, 50]] },
  alaska: { description: 'Alaska including the Aleutians, from Natural Earth', countries: ['USA'], select: [[-170, 50, -129, 72], [170, 50, 180, 56]] },
  hawaii: { description: 'Hawaiian islands from Natural Earth', countries: ['USA'], select: [[-161, 18, -154, 23]] },
  'us-waters': {
    description: 'US EEZ (Marine Regions) and the US part of the Great Lakes (Natural Earth)',
    eez: US_EEZ,
    subtract: US_LAND,
    lakes: GREAT_LAKES,
  },
  'us-land-and-waters': { description: 'US states, inhabited territories and their EEZ', countries: US_LAND, eez: US_EEZ },
  'northeast-us-shelf': {
    description: 'US EEZ from Cape Hatteras to the Gulf of Maine',
    eez: [8456],
    subtract: ['USA'],
    clip: [-78, 34, -64, 46],
  },
  'goes-east-west': {
    description: 'Useful view of GOES-East (75.2°W) and GOES-West (137.2°W), 10°+ above the horizon',
    caps: [
      { lon: -75.2, lat: 0, radius: GEO_USEFUL_RADIUS },
      { lon: -137.2, lat: 0, radius: GEO_USEFUL_RADIUS },
    ],
  },
  'us-coastal-waters': {
    description: 'Approximate 200 nmi boxes around US coasts and territories (hand-defined, not an official boundary)',
    boxes: [
      [-133, 22, -63, 50],
      [-180, 48, -125, 74],
      [170, 48, 180, 58],
      [-165, 15, -150, 25],
      [-69, 16, -63, 20],
      [144, 12, 147, 21],
      [-171.5, -15, -168, -13],
    ],
  },
  worldwide: { description: 'Full-world polygon', boxes: [[-180, -90, 180, 90]] },
}

/** Builds the source geometry for a hand-defined preset. */
export function boxesGeometry(boxes: readonly Bbox[]): SourceGeometry {
  return { type: 'MultiPolygon', coordinates: boxes.map(bboxPolygon) }
}

// polyclip-ts's tuple types (it exports only the union of them, `Geom`).
type Pair = [number, number]
type Poly = Pair[][]
type MultiPoly = Poly[]

const EARTH_WINDOWS = [
  { box: [-540, -90, -180, 90] as Bbox, shift: 360 },
  { box: [-180, -90, 180, 90] as Bbox, shift: 0 },
  { box: [180, -90, 540, 90] as Bbox, shift: -360 },
]

const toClip = (geometry: SourceGeometry): MultiPoly => polygonsOf(geometry) as MultiPoly
const fromClip = (polygons: MultiPoly): SourceGeometry => ({ type: 'MultiPolygon', coordinates: polygons })

/**
 * A spherical cap as a polygon, split at the antimeridian so every longitude stays in [-180, 180].
 * Caps that reach a pole aren't supported: their outline doesn't close in longitude.
 */
export function sphericalCap({ lon, lat, radius }: Cap, steps = 180): SourceGeometry {
  if (Math.abs(lat) + radius >= 90) throw new Error('A cap that reaches a pole is not supported')
  const rad = Math.PI / 180
  const [phi, lambda, delta] = [lat * rad, lon * rad, radius * rad]
  const ring: number[][] = []
  for (let i = 0; i < steps; i++) {
    const bearing = (2 * Math.PI * i) / steps
    const phi2 = Math.asin(Math.sin(phi) * Math.cos(delta) + Math.cos(phi) * Math.sin(delta) * Math.cos(bearing))
    const lambda2 = lambda + Math.atan2(Math.sin(bearing) * Math.sin(delta) * Math.cos(phi), Math.cos(delta) - Math.sin(phi) * Math.sin(phi2))
    // atan2 keeps lambda2 within 180° of the centre, so the ring is continuous without wrapping.
    ring.push([lambda2 / rad, phi2 / rad])
  }
  const unwrapped: MultiPoly = [[closeRing(ring) as Pair[]]]
  const pieces = EARTH_WINDOWS.flatMap(({ box, shift }) =>
    intersection(unwrapped, toClip(boxesGeometry([box]))).map((polygon) => polygon.map((r) => r.map(([x, y]) => [x + shift, y] as Pair))),
  )
  return fromClip(pieces)
}

/** Feature geometries from a GeoJSON FeatureCollection whose `key` property is one of `values`. */
function featuresWhere(collection: unknown, key: string, values: readonly (string | number)[]): SourceGeometry {
  const features = (collection as { features?: Array<{ properties?: Record<string, unknown> }> } | undefined)?.features ?? []
  const matched = features.filter((f) => values.includes(f.properties?.[key] as string | number))
  const missing = values.filter((v) => !features.some((f) => f.properties?.[key] === v))
  if (missing.length > 0) throw new Error(`Not found in source data (${key}): ${missing.join(', ')}`)
  return extractPolygons({ type: 'FeatureCollection', features: matched })
}

// Source outlines are simplified this much (degrees, ~1 km) before any union or clip, which keeps
// the polygon operations fast on the EEZ's hundreds of thousands of vertices.
const PRE_SIMPLIFY = 0.01

const preSimplify = (geometry: SourceGeometry): SourceGeometry =>
  fromClip(polygonsOf(geometry).flatMap((polygon) => {
    const simplified = simplifyPolygon(polygon, PRE_SIMPLIFY)
    return simplified ? [simplified as Poly] : []
  }))

/** GeoJSON inputs a preset draws from; the script downloads only the ones `presetSources` names. */
export interface PresetSources {
  /** Natural Earth admin-0 countries (keyed by `ADM0_A3`). */
  countries?: unknown
  /** Marine Regions EEZ (keyed by `mrgid`). */
  eez?: unknown
  /** Natural Earth lakes (keyed by `name`). */
  lakes?: unknown
}

export function presetSources(preset: Preset): Array<keyof PresetSources> {
  return [
    ...(preset.countries || preset.subtract || preset.lakes ? (['countries'] as const) : []),
    ...(preset.eez ? (['eez'] as const) : []),
    ...(preset.lakes ? (['lakes'] as const) : []),
  ]
}

/** Builds a preset's source geometry: the union of its parts, less `subtract`, plus `lakes`, cut to `clip`. */
export function presetGeometry(preset: Preset, sources: PresetSources = {}): SourceGeometry {
  const parts: SourceGeometry[] = []
  if (preset.countries) {
    const land = featuresWhere(sources.countries, 'ADM0_A3', preset.countries)
    parts.push(preset.select ? selectPolygons(land, preset.select) : land)
  }
  if (preset.eez) parts.push(featuresWhere(sources.eez, 'mrgid', preset.eez))
  if (preset.boxes) parts.push(boxesGeometry(preset.boxes))
  preset.caps?.forEach((cap) => parts.push(sphericalCap(cap)))
  if (parts.length === 0 && !preset.lakes) throw new Error('Preset has no source geometry')

  // A single part with nothing else to apply is passed through untouched, as before (#163).
  if (parts.length === 1 && !preset.subtract && !preset.lakes && !preset.clip) return parts[0] as SourceGeometry
  const [first, ...rest] = parts.map((part) => toClip(preSimplify(part)))
  let merged: MultiPoly = first ? union(first, ...rest) : []
  if (preset.subtract) merged = difference(merged, toClip(preSimplify(featuresWhere(sources.countries, 'ADM0_A3', preset.subtract))))
  if (preset.lakes) {
    const lakes = preSimplify(featuresWhere(sources.lakes, 'name', preset.lakes.names))
    const country = preSimplify(featuresWhere(sources.countries, 'ADM0_A3', [preset.lakes.within]))
    merged = union(merged, intersection(toClip(lakes), toClip(country)))
  }
  if (preset.clip) merged = intersection(merged, toClip(boxesGeometry([preset.clip])))
  if (merged.length === 0) throw new Error('Preset geometry is empty')
  return fromClip(merged)
}
