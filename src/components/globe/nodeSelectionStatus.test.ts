import { describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import type { ServiceNode } from '../../data/graphSchema'
import { parseGraphFile } from '../../data/graphSchema'
import { describeNodeSelectionForGlobe } from './nodeSelectionStatus'

const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]
const findNode = (id: string): ServiceNode => {
  const node = nodes.find((n) => n.id === id)
  if (!node) throw new Error(`fixture node "${id}" not found in graph.json`)
  return node
}

describe('describeNodeSelectionForGlobe', () => {
  it('reports the live-layer message and a bbox for a live node', () => {
    const status = describeNodeSelectionForGlobe(findNode('nws-api'))
    expect(status.message).toBe('Live layer highlighted below.')
    expect(status.bounds).toHaveLength(4)
    const [west, south, east, north] = status.bounds
    expect(west).toBeLessThan(east)
    expect(south).toBeLessThan(north)
  })

  it('reports the notLiveReason for a not-live node', () => {
    const node = findNode('spc-gis-data')
    const status = describeNodeSelectionForGlobe(node)
    expect(status.message).toBe(node.notLiveReason)
    expect(status.message.length).toBeGreaterThan(0)
  })

  it('computes bounds without throwing for every real graph.json node, as a drift guard', () => {
    for (const node of nodes) {
      const status = describeNodeSelectionForGlobe(node)
      expect(status.bounds).toHaveLength(4)
      expect(status.message.length).toBeGreaterThan(0)
    }
  })
})
