import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import { accessNodeId, buildAccessHierarchy } from './accessHierarchy'
import { makeFile, makeNode } from './graphFixtures'
import { ROOT_NODE_ID, parseGraphFile } from './graphSchema'

describe('buildAccessHierarchy', () => {
  it('has no hubs for an empty file', () => {
    expect(buildAccessHierarchy(parseGraphFile(makeFile()))).toEqual({ nodes: [], edges: [] })
  })

  it('adds one hub per method in use, linked to the root, with each service linked to its hub', () => {
    const file = parseGraphFile(
      makeFile([
        makeNode({ id: 'a-rest', accessMethod: 'rest' }),
        makeNode({ id: 'b-rest', accessMethod: 'rest' }),
        makeNode({ id: 'c-bucket', accessMethod: 'cloud-bucket' }),
      ]),
    )
    const { nodes, edges } = buildAccessHierarchy(file)
    expect(nodes.map((n) => n.id)).toEqual(['access-rest', 'access-cloud-bucket'])
    expect(nodes[0]).toMatchObject({ kind: 'access', name: 'REST / web API', accessMethod: 'rest' })
    expect(edges.map((e) => [e.source, e.target, e.type])).toEqual([
      ['access-rest', ROOT_NODE_ID, 'access'],
      ['a-rest', 'access-rest', 'access'],
      ['b-rest', 'access-rest', 'access'],
      ['access-cloud-bucket', ROOT_NODE_ID, 'access'],
      ['c-bucket', 'access-cloud-bucket', 'access'],
    ])
  })

  it('derives hub ids from the method', () => {
    expect(accessNodeId('arcgis-rest')).toBe('access-arcgis-rest')
  })

  it('gives every service in graph.json exactly one hub', () => {
    const file = parseGraphFile(graphJson)
    const { edges } = buildAccessHierarchy(file)
    for (const node of file.nodes) expect(edges.filter((e) => e.source === node.id)).toHaveLength(1)
  })

  it('rejects ids that collide with the hub prefix and a missing or unknown method', () => {
    expect(() => parseGraphFile(makeFile([makeNode({ id: 'access-x' })]))).toThrow()
    const { accessMethod: _omitted, ...withoutMethod } = makeNode()
    expect(() => parseGraphFile(makeFile([withoutMethod as never]))).toThrow()
    expect(() => parseGraphFile(makeFile([makeNode({ accessMethod: 'ftp' as never })]))).toThrow()
  })
})
