import { parseNceiDatasets, type NceiDataset } from './nceiDatasetSchema'

// The dataset rows (#62, #64, #68) load on demand (#269): they're about 44 kB gzip, and only the
// Datasets section and the search box need them. The first search focus or Datasets section starts
// the load, and components read the result through `useSyncExternalStore`.

export interface DatasetCatalog {
  /** The validated NCEI rows. */
  ncei: NceiDataset[]
  /** A curated OneStop subset with the same slim row shape, already deduped against the NCEI rows. */
  onestop: NceiDataset[]
  /** NOAA-managed AWS Open Data registry entries (#64), attached to their bucket node or the catalog node. */
  aws: NceiDataset[]
  /** The datasets reached through a service node, in file order (NCEI, OneStop, then AWS). */
  forService: (serviceId: string) => NceiDataset[]
}

let catalog: DatasetCatalog | null = null
let pending: Promise<DatasetCatalog> | null = null
const listeners = new Set<() => void>()

function buildCatalog(ncei: NceiDataset[], onestop: NceiDataset[], aws: NceiDataset[]): DatasetCatalog {
  const byService = new Map<string, NceiDataset[]>()
  for (const d of [...ncei, ...onestop, ...aws]) byService.set(d.serviceId, [...(byService.get(d.serviceId) ?? []), d])
  return { ncei, onestop, aws, forService: (serviceId) => byService.get(serviceId) ?? [] }
}

/** Loads and validates the three snapshots once. A failed load is forgotten, so the next call retries. */
export function loadDatasetCatalog(): Promise<DatasetCatalog> {
  pending ??= Promise.all([import('./nceiDatasets.json'), import('./onestopDatasets.json'), import('./awsOpenDataDatasets.json')]).then(
    ([ncei, onestop, aws]) => {
      catalog = buildCatalog(parseNceiDatasets(ncei.default), parseNceiDatasets(onestop.default), parseNceiDatasets(aws.default))
      for (const listener of listeners) listener()
      return catalog
    },
    (err: unknown) => {
      pending = null
      throw err
    },
  )
  return pending
}

/** The loaded catalog, or null until `loadDatasetCatalog` has settled. */
export function getDatasetCatalog(): DatasetCatalog | null {
  return catalog
}

export function subscribeDatasetCatalog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
