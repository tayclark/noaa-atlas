import { z } from 'zod'

// Schemas for services.swpc.noaa.gov JSON files (#54). As in nwsSchema.ts these use z.object, not
// z.strictObject: it's a third-party feed and only the fields we consume are modelled.

// OVATION's time strings are UTC with a trailing Z ("2026-09-25T00:20:00Z").
const ovationSchema = z
  .object({
    'Observation Time': z.iso.datetime(),
    'Forecast Time': z.iso.datetime(),
    // [longitude 0..359, latitude -90..90, aurora probability 0..100] on a 1° grid.
    coordinates: z.array(z.tuple([z.number(), z.number(), z.number()])),
  })
  .transform((raw) => ({
    observationTime: raw['Observation Time'],
    forecastTime: raw['Forecast Time'],
    coordinates: raw.coordinates,
  }))
export type SwpcOvation = z.output<typeof ovationSchema>

// time_tag has no zone designator but is UTC ("2026-09-25T00:27:00").
const kpRowSchema = z.object({
  time_tag: z.iso.datetime({ local: true }),
  kp_index: z.number(),
  estimated_kp: z.number(),
})
const kp1mSchema = z.array(kpRowSchema).nonempty()
export type SwpcKpRow = z.infer<typeof kpRowSchema>
export type SwpcKp1m = z.infer<typeof kp1mSchema>

export function parseOvation(raw: unknown): SwpcOvation {
  return ovationSchema.parse(raw)
}

export function parseKp1m(raw: unknown): SwpcKp1m {
  return kp1mSchema.parse(raw)
}

// noaa-scales.json: "-1" is the past 24 hours, "0" now and "1" to "3" the next three days. Observed
// periods carry a Scale and Text; forecast days carry probabilities instead, so every field is nullable.
const scaleCellSchema = z.object({
  Scale: z.string().nullable(),
  Text: z.string().nullable(),
  MinorProb: z.string().nullable().optional(),
  MajorProb: z.string().nullable().optional(),
  Prob: z.string().nullable().optional(),
})
const scalesSchema = z.record(
  z.string(),
  z.object({ DateStamp: z.string(), TimeStamp: z.string(), R: scaleCellSchema, S: scaleCellSchema, G: scaleCellSchema }),
)
export type SwpcScales = z.infer<typeof scalesSchema>
export type SwpcScaleCell = z.infer<typeof scaleCellSchema>

// alerts.json: issue_datetime is UTC with no zone designator ("2026-10-01 14:30:29.700").
const alertsSchema = z.array(z.object({ product_id: z.string(), issue_datetime: z.string(), message: z.string() }))
export type SwpcAlerts = z.infer<typeof alertsSchema>

// rtsw_wind_1m.json is about 3 MB: one row per minute for each of several spacecraft over roughly a
// day, newest first, with nulls where a spacecraft reports nothing. Keep only the active spacecraft's
// recent readings so the cached copy stays small.
const SOLAR_WIND_ROWS = 120
const solarWindRowSchema = z.object({
  time_tag: z.iso.datetime({ local: true }),
  active: z.boolean(),
  source: z.string(),
  proton_speed: z.number().nullable(),
  proton_density: z.number().nullable(),
  proton_temperature: z.number().nullable(),
})
const solarWindSchema = z.array(solarWindRowSchema).transform((rows) =>
  rows
    .filter((row) => row.active && row.proton_speed !== null)
    .sort((a, b) => b.time_tag.localeCompare(a.time_tag))
    .slice(0, SOLAR_WIND_ROWS),
)
export type SwpcSolarWind = z.output<typeof solarWindSchema>

// rtsw_mag_1m.json is the magnetometer twin of the wind file (about 1.6 MB, 150 kB gzipped): the same
// rows per spacecraft per minute, with the interplanetary magnetic field in nT.
const solarWindMagRowSchema = z.object({
  time_tag: z.iso.datetime({ local: true }),
  active: z.boolean(),
  source: z.string(),
  bt: z.number().nullable(),
  bz_gsm: z.number().nullable(),
})
const solarWindMagSchema = z.array(solarWindMagRowSchema).transform((rows) =>
  rows
    .filter((row) => row.active && row.bt !== null)
    .sort((a, b) => b.time_tag.localeCompare(a.time_tag))
    .slice(0, SOLAR_WIND_ROWS),
)
export type SwpcSolarWindMag = z.output<typeof solarWindMagSchema>

// GOES X-ray flux: one row per minute for each of two wavelength bands, which `energy` names.
const xrayRowSchema = z.object({
  time_tag: z.iso.datetime(),
  satellite: z.number(),
  flux: z.number().nullable(),
  energy: z.string(),
})
const xraysSchema = z.array(xrayRowSchema)
export type SwpcXrays = z.infer<typeof xraysSchema>

export function parseScales(raw: unknown): SwpcScales {
  return scalesSchema.parse(raw)
}

export function parseAlerts(raw: unknown): SwpcAlerts {
  return alertsSchema.parse(raw)
}

export function parseSolarWind(raw: unknown): SwpcSolarWind {
  return solarWindSchema.parse(raw)
}

export function parseSolarWindMag(raw: unknown): SwpcSolarWindMag {
  return solarWindMagSchema.parse(raw)
}

export function parseXrays(raw: unknown): SwpcXrays {
  return xraysSchema.parse(raw)
}
