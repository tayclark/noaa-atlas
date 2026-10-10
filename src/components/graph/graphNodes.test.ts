import { describe, expect, it } from 'vitest'
import { buildAccessHierarchy } from '../../data/accessHierarchy'
import { graph, graphFile } from '../../data/graphData'
import { buildOrgHierarchy } from '../../data/orgHierarchy'
import { findGraphNode, isHub, isSelectable, labelText, nodeDegree } from './graphNodes'

const org = buildOrgHierarchy(graphFile)
const access = buildAccessHierarchy(graphFile)

describe('findGraphNode', () => {
  it('finds a graph node by id, and nothing for none or an unknown id', () => {
    expect(findGraphNode('nws-api')?.name).toBe('NWS API')
    expect(findGraphNode(null)).toBeUndefined()
    expect(findGraphNode('no-such-node')).toBeUndefined()
  })
})

describe('isHub / isSelectable', () => {
  it('treats the org and access hubs as structure, and every graph node as selectable', () => {
    for (const node of [...org.nodes, ...access.nodes]) {
      expect(isHub(node)).toBe(true)
      expect(isSelectable(node)).toBe(false)
    }
    for (const node of graph.nodes) {
      expect(isHub(node)).toBe(false)
      expect(isSelectable(node)).toBe(true)
    }
  })
})

describe('nodeDegree', () => {
  it('counts the edges at each end', () => {
    const degree = nodeDegree([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
    ])
    expect(Object.fromEntries(degree)).toEqual({ a: 2, b: 1, c: 1 })
  })
})

describe('labelText', () => {
  it("is a service's short name when it has one, and the name otherwise", () => {
    const service = graph.nodes.find((node) => node.kind === 'service' && node.shortName)!
    expect(labelText(service)).toBe(service.kind === 'service' ? service.shortName : '')
    expect(labelText({ ...service, shortName: undefined } as typeof service)).toBe(service.name)
    const hub = org.nodes[0]!
    expect(labelText(hub)).toBe(hub.name)
  })
})
