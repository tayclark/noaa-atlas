import { describe, expect, it } from 'vitest'
import graph from './graph.json'
import { parseNceiDatasets } from './nceiDatasetSchema'
import { NCEI_DATASETS, ONESTOP_DATASETS, datasetsForService } from './nceiDatasets'

describe('NCEI_DATASETS', () => {
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

  it('rejects malformed rows', () => {
    expect(() => parseNceiDatasets([{ id: 'Bad Id' }])).toThrow()
  })
})
