import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import { makeFile, makeNode } from './graphFixtures'
import { ROOT_NODE_ID, parseGraphFile } from './graphSchema'
import { buildOrgHierarchy, officeNodeId, programNodeId } from './orgHierarchy'

const owner = (office: string, programGroup?: string) => ({ office, program: 'Some program', ...(programGroup ? { programGroup } : {}) })

describe('buildOrgHierarchy', () => {
  it('has no hubs for an empty file', () => {
    expect(buildOrgHierarchy(parseGraphFile(makeFile()))).toEqual({ nodes: [], edges: [] })
  })

  it('links a service without a programGroup straight to its office, and the office to the root', () => {
    const { nodes, edges } = buildOrgHierarchy(parseGraphFile(makeFile([makeNode({ owner: owner('NWS') })])))
    expect(nodes).toEqual([{ id: 'office-nws', kind: 'office', name: 'National Weather Service', office: 'NWS' }])
    expect(edges.map((e) => [e.source, e.target, e.type])).toEqual([
      ['office-nws', ROOT_NODE_ID, 'org'],
      ['nws-api', 'office-nws', 'org'],
    ])
  })

  it('adds a program hub only when two services in one office share a programGroup', () => {
    const file = parseGraphFile(
      makeFile([
        makeNode({ id: 'a-one', owner: owner('NOS', 'CO-OPS') }),
        makeNode({ id: 'a-two', owner: owner('NOS', 'CO-OPS') }),
        makeNode({ id: 'b-lone', owner: owner('NOS', 'Solo') }),
        makeNode({ id: 'c-other-office', owner: owner('NWS', 'CO-OPS') }),
      ]),
    )
    const { nodes, edges } = buildOrgHierarchy(file)
    expect(nodes.filter((n) => n.kind === 'program').map((n) => n.id)).toEqual(['program-nos-co-ops'])
    const parentOf = (id: string) => edges.find((e) => e.source === id)?.target
    expect(parentOf('a-one')).toBe('program-nos-co-ops')
    expect(parentOf('a-two')).toBe('program-nos-co-ops')
    expect(parentOf('b-lone')).toBe('office-nos')
    expect(parentOf('c-other-office')).toBe('office-nws')
    expect(parentOf('program-nos-co-ops')).toBe('office-nos')
  })

  it('derives program ids from the office and group', () => {
    const [node] = parseGraphFile(makeFile([makeNode({ owner: owner('NESDIS', 'Office of Coast Survey') })])).nodes
    expect(programNodeId(node!)).toBe('program-nesdis-office-of-coast-survey')
    expect(officeNodeId('NESDIS')).toBe('office-nesdis')
  })

  it('gives every service in graph.json exactly one parent', () => {
    const file = parseGraphFile(graphJson)
    const { edges } = buildOrgHierarchy(file)
    for (const node of file.nodes) expect(edges.filter((e) => e.source === node.id)).toHaveLength(1)
  })

  it('rejects ids that collide with the hub prefixes', () => {
    expect(() => parseGraphFile(makeFile([makeNode({ id: 'office-nws' })]))).toThrow()
    expect(() => parseGraphFile(makeFile([makeNode({ id: 'program-x' })]))).toThrow()
  })
})
