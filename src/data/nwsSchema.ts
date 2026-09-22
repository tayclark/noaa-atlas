import { z } from 'zod'

// Schemas for api.weather.gov responses. Unlike graphSchema.ts (which validates our own
// authored data with z.strictObject), these use z.object: the NWS payloads are a third-party,
// evolving API and we only model the fields we actually consume — unrelated fields it adds
// later should not fail validation.

const position = z.tuple([z.number(), z.number()])
const ring = z.array(position)
const polygonCoordinates = z.array(ring)

const alertGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygonCoordinates }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygonCoordinates) }),
])

const alertPropertiesSchema = z.object({
  id: z.string(),
  event: z.string(),
  headline: z.string().nullable(),
  severity: z.enum(['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown']),
  areaDesc: z.string(),
  effective: z.iso.datetime({ offset: true }),
  expires: z.iso.datetime({ offset: true }),
})

const alertFeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: alertPropertiesSchema,
  // Zone-only alerts (no polygon on file) have a null geometry; that's a valid response, not an error.
  geometry: alertGeometrySchema.nullable(),
})

export const alertCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(alertFeatureSchema),
})
export type NwsAlertCollection = z.infer<typeof alertCollectionSchema>

export const pointSchema = z.object({
  properties: z.object({
    gridId: z.string(),
    gridX: z.number(),
    gridY: z.number(),
    forecast: z.url(),
    forecastGridData: z.url(),
    forecastHourly: z.url(),
    observationStations: z.url(),
    relativeLocation: z.object({
      properties: z.object({ city: z.string(), state: z.string() }),
    }),
  }),
})
export type NwsPoint = z.infer<typeof pointSchema>

const forecastPeriodSchema = z.object({
  number: z.number(),
  name: z.string(),
  startTime: z.iso.datetime({ offset: true }),
  endTime: z.iso.datetime({ offset: true }),
  temperature: z.number(),
  temperatureUnit: z.string(),
  windSpeed: z.string(),
  windDirection: z.string(),
  shortForecast: z.string(),
  detailedForecast: z.string(),
})
export type NwsForecastPeriod = z.infer<typeof forecastPeriodSchema>

export const gridpointForecastSchema = z.object({
  properties: z.object({
    // NWS omits `updated` entirely for some gridpoints in practice, despite documenting it as
    // a required timestamp — nullish here so a real, valid forecast response doesn't fail to
    // parse whether the field is missing or explicitly null.
    updated: z.iso.datetime({ offset: true }).nullish(),
    periods: z.array(forecastPeriodSchema),
  }),
})
export type NwsGridpointForecast = z.infer<typeof gridpointForecastSchema>

const stationSchema = z.object({
  properties: z.object({ stationIdentifier: z.string(), name: z.string() }),
  geometry: z.object({ type: z.literal('Point'), coordinates: position }),
})
export type NwsStation = z.infer<typeof stationSchema>

export const stationCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(stationSchema),
})
export type NwsStationCollection = z.infer<typeof stationCollectionSchema>

// NWS observation measurements are wrapped as { value, unitCode } and value is frequently
// null (sensor down, calm wind, etc.) — that's a valid response, not an error, so value must
// stay nullable or common real-world responses would fail to parse.
const measurementSchema = z.object({
  value: z.number().nullable(),
  unitCode: z.string(),
})

export const observationSchema = z.object({
  properties: z.object({
    timestamp: z.iso.datetime({ offset: true }),
    textDescription: z.string(),
    temperature: measurementSchema,
    windSpeed: measurementSchema,
    windDirection: measurementSchema,
  }),
})
export type NwsObservation = z.infer<typeof observationSchema>

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new Error(`Invalid NWS response:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}

export function parseAlertCollection(raw: unknown): NwsAlertCollection {
  return parse(alertCollectionSchema, raw)
}

export function parsePoint(raw: unknown): NwsPoint {
  return parse(pointSchema, raw)
}

export function parseGridpointForecast(raw: unknown): NwsGridpointForecast {
  return parse(gridpointForecastSchema, raw)
}

export function parseStationCollection(raw: unknown): NwsStationCollection {
  return parse(stationCollectionSchema, raw)
}

export function parseObservation(raw: unknown): NwsObservation {
  return parse(observationSchema, raw)
}
