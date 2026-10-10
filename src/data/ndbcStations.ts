import { z } from 'zod'
import { loadOnce } from './loadOnce'
import { stationFields } from './schemaPrimitives'

// The snapshot in ndbcStations.json (scripts/ndbc-stations.mjs).
const stationSchema = z.strictObject(stationFields)
export type NdbcStation = z.infer<typeof stationSchema>

/** Loads and validates the snapshot once, the first time its layer is shown (#269). */
export const loadNdbcStations = loadOnce(async () => z.array(stationSchema).parse((await import('./ndbcStations.json')).default))
