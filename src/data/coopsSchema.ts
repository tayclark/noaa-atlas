import { z } from 'zod'

// Schemas for the CO-OPS Data API (api.tidesandcurrents.noaa.gov, #51). As in nwsSchema.ts these use
// z.object, not z.strictObject: only the fields we consume are modelled. Times are requested with
// time_zone=gmt, so "2026-09-30 13:48" is UTC with no zone designator.

// CO-OPS answers an unknown station, or one without the requested product, with HTTP 200 and
// {"error": {"message": "..."}}. That is modelled as a result rather than a throw, so the popup
// can show CO-OPS's own message instead of a generic "unexpected response".
const errorBody = z.object({ error: z.object({ message: z.string() }) })

// Values arrive as strings, and a missing reading is an empty string.
const value = z.string().transform((v) => (v.trim() === '' ? null : Number(v)))

const waterLevelSchema = z.object({
  metadata: z.object({ id: z.string(), name: z.string() }),
  data: z.array(z.object({ t: z.string(), v: value })),
})

const predictionsSchema = z.object({
  predictions: z.array(z.object({ t: z.string(), v: value, type: z.enum(['H', 'L']) })),
})

// interval=h returns the whole curve, without the high/low `type` of interval=hilo.
const hourlyPredictionsSchema = z.object({
  predictions: z.array(z.object({ t: z.string(), v: value })),
})

export interface CoopsReading {
  /** UTC, "YYYY-MM-DD HH:mm". */
  time: string
  /** Metres above MLLW, or null when CO-OPS sent no value. */
  metres: number | null
}
export interface CoopsTide extends CoopsReading {
  kind: 'high' | 'low'
}

export type CoopsResult<T> = { ok: true; value: T } | { ok: false; message: string }

export function parseWaterLevel(raw: unknown): CoopsResult<CoopsReading | null> {
  const error = errorBody.safeParse(raw)
  if (error.success) return { ok: false, message: error.data.error.message }
  const body = waterLevelSchema.parse(raw)
  const latest = body.data[body.data.length - 1]
  return { ok: true, value: latest ? { time: latest.t, metres: latest.v } : null }
}

export function parsePredictions(raw: unknown): CoopsResult<CoopsTide[]> {
  const error = errorBody.safeParse(raw)
  if (error.success) return { ok: false, message: error.data.error.message }
  const body = predictionsSchema.parse(raw)
  return {
    ok: true,
    value: body.predictions.map((p) => ({ time: p.t, metres: p.v, kind: p.type === 'H' ? 'high' : 'low' })),
  }
}

/** Predicted hourly water level (metres above MLLW), oldest first. */
export function parseHourlyPredictions(raw: unknown): CoopsResult<CoopsReading[]> {
  const error = errorBody.safeParse(raw)
  if (error.success) return { ok: false, message: error.data.error.message }
  const body = hourlyPredictionsSchema.parse(raw)
  return { ok: true, value: body.predictions.map((p) => ({ time: p.t, metres: p.v })) }
}

// The station snapshot in coopsStations.json (scripts/coops-stations.mjs).
export const stationSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  state: z.string(),
})
export type CoopsStation = z.infer<typeof stationSchema>

export function parseStations(raw: unknown): CoopsStation[] {
  return z.array(stationSchema).parse(raw)
}

// Metadata API (mdapi, #241): a station with expand=details,datums,floodlevels and units=metric.
// An unknown station is an HTTP 404, so there is no 200 error body to model here.
const nullableNumber = z.number().nullable()
const stationMetadataSchema = z.object({
  stations: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        state: z.string(),
        details: z.object({ established: z.string().nullable(), noaachart: z.string().nullable() }),
        // Great Lakes stations have no tidal epoch (e.g. 9063020).
        datums: z.object({
          epoch: z.string().nullable(),
          units: z.string(),
          datums: z.array(z.object({ name: z.string(), description: z.string(), value: nullableNumber })),
        }),
        floodlevels: z.object({ nos_minor: nullableNumber, nos_moderate: nullableNumber, nos_major: nullableNumber }),
      }),
    )
    .min(1),
})
export type CoopsStationMetadata = z.infer<typeof stationMetadataSchema>['stations'][number]

export function parseStationMetadata(raw: unknown): CoopsStationMetadata {
  return stationMetadataSchema.parse(raw).stations[0]
}

// Derived Product API (dpapi, #241). An unknown station is a 200 with an empty list.
const seaLevelTrendSchema = z.object({
  SeaLvlTrends: z.array(
    z.object({
      stationName: z.string(),
      trend: z.number(),
      trendError: z.number(),
      trendUnits: z.string(),
      startDate: z.string(),
      endDate: z.string(),
    }),
  ),
})
export type CoopsSeaLevelTrend = z.infer<typeof seaLevelTrendSchema>['SeaLvlTrends'][number]

export function parseSeaLevelTrend(raw: unknown): CoopsResult<CoopsSeaLevelTrend> {
  const trend = seaLevelTrendSchema.parse(raw).SeaLvlTrends[0]
  return trend ? { ok: true, value: trend } : { ok: false, message: 'CO-OPS has no sea level trend for this station.' }
}

const htfAnnualSchema = z.object({
  AnnualFloodCount: z.array(
    z.object({ year: z.number(), minCount: nullableNumber, modCount: nullableNumber, majCount: nullableNumber }),
  ),
})
export type CoopsFloodYear = z.infer<typeof htfAnnualSchema>['AnnualFloodCount'][number]

/** High tide flood days per year, oldest first. */
export function parseHtfAnnual(raw: unknown): CoopsFloodYear[] {
  return htfAnnualSchema.parse(raw).AnnualFloodCount
}
