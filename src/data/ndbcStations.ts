import { z } from 'zod'
import stationsJson from './ndbcStations.json'

// The snapshot in ndbcStations.json (scripts/ndbc-stations.mjs).
const stationSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type NdbcStation = z.infer<typeof stationSchema>

// Validated once at module scope: the snapshot is small and static.
export const NDBC_STATIONS: NdbcStation[] = z.array(stationSchema).parse(stationsJson)
