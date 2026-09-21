import { z } from 'zod'

/** One entry per graph theme; also the source of the generated theme hub nodes. */
export const THEMES = [
  'weather',
  'climate',
  'ocean',
  'satellite',
  'space-weather',
  'models',
  'hazards',
  'fisheries',
  'geospatial',
  'catalogs',
] as const
export type Theme = (typeof THEMES)[number]

export const THEME_LABELS: Record<Theme, string> = {
  weather: 'Weather & forecast',
  climate: 'Climate & historical',
  ocean: 'Ocean & coastal',
  satellite: 'Satellite & radar',
  'space-weather': 'Space weather',
  models: 'Models & gridded data',
  hazards: 'Hazards',
  fisheries: 'Fisheries & ecosystem',
  geospatial: 'Geospatial services',
  catalogs: 'Catalogs & meta',
}

export const THEME_ID_PREFIX = 'theme-'

const OFFICES = ['NWS', 'NOS', 'NESDIS', 'OAR', 'NMFS', 'OMAO', 'other'] as const
const FORMATS = ['json', 'geojson', 'csv', 'xml', 'netcdf', 'grib2', 'geotiff', 'kml', 'shapefile', 'arcgis-rest', 'tiles', 'text', 'other'] as const
const CADENCES = ['realtime', 'minutes', 'hourly', 'daily', 'periodic', 'static'] as const

// Coordinates are limited to 3 decimal places (~100 m) to keep graph.json small.
const hasAtMostThreeDecimals = (n: number) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6
const DECIMALS_MESSAGE = 'coordinates may have at most 3 decimal places'

const lon = z.number().min(-180).max(180).refine(hasAtMostThreeDecimals, DECIMALS_MESSAGE)
const lat = z.number().min(-90).max(90).refine(hasAtMostThreeDecimals, DECIMALS_MESSAGE)
const position = z.tuple([lon, lat])

const ring = z
  .array(position)
  .min(4, 'a ring needs at least 4 positions')
  .refine((r) => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1], 'ring must be closed (first and last position equal)')
const polygonCoordinates = z.array(ring).min(1)

/** WGS84 GeoJSON geometry describing where an API has data. Worldwide reach is a full-world polygon. */
export const coverageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('Polygon'), coordinates: polygonCoordinates }),
  z.strictObject({ type: z.literal('MultiPolygon'), coordinates: z.array(polygonCoordinates).min(1) }),
])
export type Coverage = z.infer<typeof coverageSchema>

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase slug (a-z, 0-9, hyphens)')
  .refine((id) => !id.startsWith(THEME_ID_PREFIX), `ids starting with "${THEME_ID_PREFIX}" are reserved for theme hubs`)

const nonEmpty = z.string().trim().min(1)

export const serviceNodeSchema = z
  .strictObject({
    id: slug,
    kind: z.literal('service'),
    name: nonEmpty,
    summary: nonEmpty,
    owner: z.strictObject({ office: z.enum(OFFICES), program: nonEmpty }),
    theme: z.enum(THEMES),
    baseUrl: z.url(),
    formats: z.array(z.enum(FORMATS)).min(1),
    auth: z.strictObject({ type: z.enum(['none', 'token', 'key']), note: nonEmpty.optional() }),
    rateLimits: z.strictObject({ text: nonEmpty, sourceUrl: z.url().optional() }).optional(),
    coverage: coverageSchema,
    freshness: z.strictObject({ cadence: z.enum(CADENCES), note: nonEmpty.optional() }),
    docUrl: z.url(),
    lastVerified: z.iso.date(),
    liveLayer: z.boolean(),
    notLiveReason: nonEmpty.optional(),
    tags: z.array(nonEmpty).default([]),
  })
  .refine((node) => node.liveLayer || node.notLiveReason !== undefined, {
    message: 'notLiveReason is required when liveLayer is false',
    path: ['notLiveReason'],
  })
export type ServiceNode = z.infer<typeof serviceNodeSchema>

/** Theme edges are derived by buildGraph(), so only these types are authored. */
export const authoredEdgeSchema = z.strictObject({
  source: slug,
  target: slug,
  type: z.enum(['shared-id', 'data-flow']),
  label: nonEmpty,
  sourceUrl: z.url(),
})
export type AuthoredEdge = z.infer<typeof authoredEdgeSchema>

export const graphFileSchema = z.strictObject({
  version: z.literal(1),
  nodes: z.array(serviceNodeSchema),
  edges: z.array(authoredEdgeSchema),
})
export type GraphFile = z.infer<typeof graphFileSchema>

export interface ThemeNode {
  id: string
  kind: 'theme'
  name: string
  theme: Theme
}
export type GraphNode = ServiceNode | ThemeNode

export interface GraphEdge {
  source: string
  target: string
  type: 'theme' | 'shared-id' | 'data-flow'
  label: string
  sourceUrl?: string
}

/** Runtime graph: authored services and edges plus generated theme hubs and theme edges. */
export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Validates untrusted graph data and throws an Error with readable field paths. */
export function parseGraphFile(raw: unknown): GraphFile {
  const result = graphFileSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`Invalid graph data:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
