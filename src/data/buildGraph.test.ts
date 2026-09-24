import { describe, expect, it } from 'vitest'
import { buildGraph } from './buildGraph'
import { makeEdge, makeFile, makeNode } from './graphFixtures'
import { ROOT_NODE_ID, THEMES, parseGraphFile } from './graphSchema'

describe('buildGraph', () => {
  it('adds the NOAA root and one theme hub per theme, even for an empty file', () => {
    const graph = buildGraph(parseGraphFile(makeFile()))
    expect(graph.nodes).toHaveLength(THEMES.length + 1)
    expect(graph.nodes[0]).toEqual({ id: ROOT_NODE_ID, kind: 'root', name: 'NOAA' })
    expect(graph.nodes.slice(1).every((n) => n.kind === 'theme')).toBe(true)
    expect(graph.edges.every((e) => e.type === 'root')).toBe(true)
  })

  it('links every theme hub to the root, so the graph is one connected tree', () => {
    const rootEdges = buildGraph(parseGraphFile(makeFile())).edges.filter((e) => e.type === 'root')
    expect(rootEdges).toHaveLength(THEMES.length)
    expect(rootEdges.map((e) => e.source)).toEqual(THEMES.map((t) => `theme-${t}`))
    expect(rootEdges.every((e) => e.target === ROOT_NODE_ID)).toBe(true)
  })

  it('derives one theme edge per service pointing at its theme hub', () => {
    const file = parseGraphFile(
      makeFile([makeNode(), makeNode({ id: 'coops-data', theme: 'ocean' })]),
    )
    const themeEdges = buildGraph(file).edges.filter((e) => e.type === 'theme')
    expect(themeEdges).toEqual([
      { source: 'nws-api', target: 'theme-weather', type: 'theme', label: 'Weather & forecast' },
      { source: 'coops-data', target: 'theme-ocean', type: 'theme', label: 'Ocean & coastal' },
    ])
  })

  it('keeps authored nodes and edges untouched', () => {
    const file = parseGraphFile(
      makeFile([makeNode(), makeNode({ id: 'coops-data', theme: 'ocean' })], [makeEdge()]),
    )
    const graph = buildGraph(file)
    expect(graph.nodes.filter((n) => n.kind === 'service')).toEqual(file.nodes)
    expect(graph.edges.filter((e) => e.type === 'shared-id')).toEqual(file.edges)
  })

  it('gives every hub a unique id that no service can use', () => {
    const ids = buildGraph(parseGraphFile(makeFile()))
      .nodes.filter((n) => n.kind === 'theme')
      .map((n) => n.id)
    expect(new Set(ids).size).toBe(THEMES.length)
    expect(ids.every((id) => id.startsWith('theme-'))).toBe(true)
  })

  it('reserves the root id so no service can take it', () => {
    expect(() => parseGraphFile(makeFile([makeNode({ id: ROOT_NODE_ID })]))).toThrow(/reserved for the root node/)
  })
})
