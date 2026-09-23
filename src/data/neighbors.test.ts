import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import { buildGraph } from './buildGraph'
import { parseGraphFile } from './graphSchema'
import { getNeighbors } from './neighbors'

const graph = buildGraph(parseGraphFile(graphJson))

describe('getNeighbors', () => {
  it('groups incoming data-flow edges before theme edges, with direction and reason', () => {
    const groups = getNeighbors(graph, 'nws-gis-portal')
    expect(groups.map((g) => g.type)).toEqual(['data-flow', 'theme'])
    const flow = groups[0]!
    expect(flow.neighbors.map((n) => n.node.id).sort()).toEqual(['cpc-gis-data', 'spc-gis-data', 'wpc-gis-products'])
    for (const n of flow.neighbors) {
      expect(n.direction).toBe('in')
      expect(n.label.length).toBeGreaterThan(0)
      expect(n.sourceUrl).toMatch(/^https:/)
    }
  })

  it('reports outgoing edges from the other endpoint', () => {
    const flow = getNeighbors(graph, 'spc-gis-data').find((g) => g.type === 'data-flow')
    expect(flow?.neighbors).toHaveLength(1)
    expect(flow?.neighbors[0]).toMatchObject({ direction: 'out' })
    expect(flow?.neighbors[0]?.node.id).toBe('nws-gis-portal')
  })

  it('gives every service a theme group whose neighbor is a hub', () => {
    for (const node of graph.nodes.filter((n) => n.kind === 'service')) {
      const theme = getNeighbors(graph, node.id).find((g) => g.type === 'theme')
      expect(theme?.neighbors[0]?.node.kind).toBe('theme')
    }
  })

  it('returns no groups for an unknown node', () => {
    expect(getNeighbors(graph, 'nope')).toEqual([])
  })

  it('sorts neighbors by name and skips edges to missing nodes', () => {
    const g = {
      nodes: graph.nodes.filter((n) => ['spc-gis-data', 'wpc-gis-products', 'cpc-gis-data'].includes(n.id)),
      edges: [
        { source: 'wpc-gis-products', target: 'cpc-gis-data', type: 'shared-id' as const, label: 'a' },
        { source: 'cpc-gis-data', target: 'spc-gis-data', type: 'shared-id' as const, label: 'b' },
        { source: 'cpc-gis-data', target: 'ghost', type: 'shared-id' as const, label: 'c' },
      ],
    }
    const names = getNeighbors(g, 'cpc-gis-data')[0]!.neighbors.map((n) => n.node.name)
    expect(names).toHaveLength(2)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})
