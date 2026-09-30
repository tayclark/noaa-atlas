import stationsJson from './coopsStations.json'
import { parseStations } from './coopsSchema'

// Validated once at module scope: the snapshot is small and static.
export const COOPS_STATIONS = parseStations(stationsJson)
