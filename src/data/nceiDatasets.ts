import datasetsJson from './nceiDatasets.json'
import onestopJson from './onestopDatasets.json'
import { parseNceiDatasets } from './nceiDatasetSchema'

// Validated once at module scope: the snapshots are small and static (#62, #68).
export const NCEI_DATASETS = parseNceiDatasets(datasetsJson)
// A curated OneStop subset with the same slim row shape, already deduped against the NCEI rows.
export const ONESTOP_DATASETS = parseNceiDatasets(onestopJson)

const ALL_DATASETS = [...NCEI_DATASETS, ...ONESTOP_DATASETS]

export function datasetsForService(serviceId: string) {
  return ALL_DATASETS.filter((d) => d.serviceId === serviceId)
}
