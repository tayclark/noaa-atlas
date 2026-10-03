import { z } from 'zod'

// The snapshot in dartStations.json (scripts/dart-stations.mjs).
const stationSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type DartStation = z.infer<typeof stationSchema>

let pending: Promise<DartStation[]> | null = null

/**
 * Loads and validates the snapshot once, the first time its layer is shown (#269). A failed load is
 * forgotten, so the next call retries.
 */
export function loadDartStations(): Promise<DartStation[]> {
  pending ??= import('./dartStations.json').then(
    (json) => z.array(stationSchema).parse(json.default),
    (err: unknown) => {
      pending = null
      throw err
    },
  )
  return pending
}
