import { z } from 'zod'

// Schema for the NHC tropical weather summary MapServer queries (#334; see the nhc-active-storms
// node in graph.json), asked for as `f=geojson`. As in spcSchema.ts this uses z.object, not
// z.strictObject: it's a third-party feed and only the fields the storm track consumes are modelled.
// `binnumber` (AT1-AT5, EP1-EP5, CP1-CP5) is the key that ties a storm's points and cone together.

const position = z.tuple([z.number(), z.number()]).rest(z.number())
const ring = z.array(position)

const pointGeometry = z.object({ type: z.literal('Point'), coordinates: position })
const polygonGeometry = z.object({ type: z.literal('Polygon'), coordinates: z.array(ring) })
const multiPolygonGeometry = z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring)) })

/** Layer 10: the storm's observed (best-track) fixes, every 6 hours. `dtg` is YYYYMMDDHH in UTC. */
const pastPointSchema = z.object({
  type: z.literal('Feature'),
  geometry: pointGeometry,
  properties: z.object({
    binnumber: z.string(),
    stormname: z.string(),
    stormtype: z.string(),
    intensity: z.number(),
    dtg: z.number(),
  }),
})

/** Layer 5: the latest advisory's forecast fixes. `validtime` is DD/HHMM in UTC; `tau` is hours ahead. */
const forecastPointSchema = z.object({
  type: z.literal('Feature'),
  geometry: pointGeometry,
  properties: z.object({
    binnumber: z.string(),
    stormname: z.string(),
    tau: z.number(),
    validtime: z.string(),
    maxwind: z.number(),
    tcdvlp: z.string(),
    advisnum: z.string(),
    idp_filedate: z.number(),
  }),
})

/** Layer 7: the forecast cone, one polygon per storm. */
const conePolygonSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.union([polygonGeometry, multiPolygonGeometry]),
  properties: z.object({ binnumber: z.string() }),
})

const collection = <T extends z.ZodTypeAny>(feature: T) =>
  z.object({ type: z.literal('FeatureCollection'), features: z.array(feature) })

const pastPointsSchema = collection(pastPointSchema)
const forecastPointsSchema = collection(forecastPointSchema)
const conesSchema = collection(conePolygonSchema)

export type NhcPastPoints = z.infer<typeof pastPointsSchema>
export type NhcPastPoint = NhcPastPoints['features'][number]
export type NhcForecastPoints = z.infer<typeof forecastPointsSchema>
export type NhcForecastPoint = NhcForecastPoints['features'][number]
export type NhcCones = z.infer<typeof conesSchema>
export type NhcCone = NhcCones['features'][number]

export function parseNhcPastPoints(raw: unknown): NhcPastPoints {
  return pastPointsSchema.parse(raw)
}

export function parseNhcForecastPoints(raw: unknown): NhcForecastPoints {
  return forecastPointsSchema.parse(raw)
}

export function parseNhcCones(raw: unknown): NhcCones {
  return conesSchema.parse(raw)
}
