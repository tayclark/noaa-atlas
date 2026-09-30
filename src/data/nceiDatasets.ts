import datasetsJson from './nceiDatasets.json'
import { parseNceiDatasets } from './nceiDatasetSchema'

// Validated once at module scope: the snapshot is small and static (#62).
export const NCEI_DATASETS = parseNceiDatasets(datasetsJson)

export function datasetsForService(serviceId: string) {
  return NCEI_DATASETS.filter((d) => d.serviceId === serviceId)
}
