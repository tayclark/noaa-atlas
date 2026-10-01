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
