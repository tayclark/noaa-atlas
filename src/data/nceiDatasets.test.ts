import { describe, expect, it } from 'vitest'
import graph from './graph.json'
import { parseNceiDatasets } from './nceiDatasetSchema'
import { NCEI_DATASETS, datasetsForService } from './nceiDatasets'

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

  it('rejects malformed rows', () => {
    expect(() => parseNceiDatasets([{ id: 'Bad Id' }])).toThrow()
  })
})
