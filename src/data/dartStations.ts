import { z } from 'zod'
import stationsJson from './dartStations.json'

// The snapshot in dartStations.json (scripts/dart-stations.mjs).
const stationSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type DartStation = z.infer<typeof stationSchema>

// Validated once at module scope: the snapshot is small and static.
export const DART_STATIONS: DartStation[] = z.array(stationSchema).parse(stationsJson)
