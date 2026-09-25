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
