import { beforeAll, describe, expect, it } from 'vitest'
import graph from './graph.json'
import type { NceiDataset } from './nceiDatasetSchema'
import { parseNceiDatasets } from './nceiDatasetSchema'
import { getDatasetCatalog, loadDatasetCatalog, subscribeDatasetCatalog, type DatasetCatalog } from './nceiDatasets'

let NCEI_DATASETS: NceiDataset[]
let ONESTOP_DATASETS: NceiDataset[]
let AWS_DATASETS: NceiDataset[]
let datasetsForService: DatasetCatalog['forService']

describe('loadDatasetCatalog (#269)', () => {
  it('loads once, notifies subscribers and then serves the same catalog', async () => {
    expect(getDatasetCatalog()).toBeNull()
    let notified = 0
    const unsubscribe = subscribeDatasetCatalog(() => notified++)
    const first = loadDatasetCatalog()
    expect(loadDatasetCatalog()).toBe(first)
    const catalog = await first
    unsubscribe()
    expect(notified).toBe(1)
    expect(getDatasetCatalog()).toBe(catalog)
    expect(await loadDatasetCatalog()).toBe(catalog)
  })
})

describe('the dataset catalog', () => {
  beforeAll(async () => {
    const catalog = await loadDatasetCatalog()
    NCEI_DATASETS = catalog.ncei
    ONESTOP_DATASETS = catalog.onestop
    AWS_DATASETS = catalog.aws
    datasetsForService = catalog.forService
  })

  it('is a validated snapshot of unique datasets', () => {
    expect(NCEI_DATASETS.length).toBeGreaterThan(50)
    expect(new Set(NCEI_DATASETS.map((d) => d.id)).size).toBe(NCEI_DATASETS.length)
  })

  it('links every dataset to a curated service node', () => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    for (const d of NCEI_DATASETS) expect(nodeIds.has(d.serviceId), d.id).toBe(true)
  })

  it('finds datasets by service', () => {
    expect(datasetsForService('ncei-access-data-service').map((d) => d.id)).toContain('daily-summaries')
    expect(datasetsForService('no-such-node')).toEqual([])
  })

  it('adds a curated OneStop subset that does not repeat NCEI rows', () => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    expect(ONESTOP_DATASETS.length).toBeGreaterThan(100)
    const ids = [...NCEI_DATASETS, ...ONESTOP_DATASETS].map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const nceiNames = new Set(NCEI_DATASETS.map((d) => norm(d.name)))
    for (const d of ONESTOP_DATASETS) {
      expect(nodeIds.has(d.serviceId), d.id).toBe(true)
      expect(nceiNames.has(norm(d.name)), d.id).toBe(false)
      expect(d.doi?.startsWith('https://'), d.id).toBe(true)
    }
    const onestop = datasetsForService('onestop-search-api').map((d) => d.id)
    expect(onestop).toContain(ONESTOP_DATASETS[0].id)
  })

  it('adds NOAA AWS Open Data registry rows attached to bucket or catalog nodes (#64)', () => {
    const nodeIds = new Set(graph.nodes.map((n) => n.id))
    expect(AWS_DATASETS.length).toBeGreaterThan(50)
    const ids = [...NCEI_DATASETS, ...ONESTOP_DATASETS, ...AWS_DATASETS].map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of AWS_DATASETS) {
      expect(nodeIds.has(d.serviceId), d.id).toBe(true)
      expect(d.doi?.startsWith('https://registry.opendata.aws/'), d.id).toBe(true)
    }
    expect(AWS_DATASETS.some((d) => d.serviceId !== 'aws-open-data-noaa')).toBe(true)
    expect(datasetsForService('aws-open-data-noaa').length).toBeGreaterThan(50)
  })

  it('rejects malformed rows', () => {
    expect(() => parseNceiDatasets([{ id: 'Bad Id' }])).toThrow()
  })
})
