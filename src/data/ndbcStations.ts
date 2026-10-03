import { z } from 'zod'

// The snapshot in ndbcStations.json (scripts/ndbc-stations.mjs).
const stationSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type NdbcStation = z.infer<typeof stationSchema>

let pending: Promise<NdbcStation[]> | null = null

/**
 * Loads and validates the snapshot once, the first time its layer is shown (#269). A failed load is
 * forgotten, so the next call retries.
 */
export function loadNdbcStations(): Promise<NdbcStation[]> {
  pending ??= import('./ndbcStations.json').then(
    (json) => z.array(stationSchema).parse(json.default),
    (err: unknown) => {
      pending = null
      throw err
    },
  )
  return pending
}
