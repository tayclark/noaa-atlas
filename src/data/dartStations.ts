import { z } from 'zod'
import { loadOnce } from './loadOnce'
import { stationFields } from './schemaPrimitives'

// The snapshot in dartStations.json (scripts/dart-stations.mjs).
const stationSchema = z.strictObject(stationFields)
export type DartStation = z.infer<typeof stationSchema>

/** Loads and validates the snapshot once, the first time its layer is shown (#269). */
export const loadDartStations = loadOnce(async () => z.array(stationSchema).parse((await import('./dartStations.json')).default))
