import { describe, expect, it } from 'vitest'
import { buildGraph } from './buildGraph'
import { makeEdge, makeFile, makeNode } from './graphFixtures'
import { THEMES, parseGraphFile } from './graphSchema'

describe('buildGraph', () => {
  it('adds one theme hub per theme, even for an empty file', () => {
    const graph = buildGraph(parseGraphFile(makeFile()))
    expect(graph.nodes).toHaveLength(THEMES.length)
    expect(graph.nodes.every((n) => n.kind === 'theme')).toBe(true)
    expect(graph.edges).toEqual([])
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
    const ids = buildGraph(parseGraphFile(makeFile())).nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(THEMES.length)
    expect(ids.every((id) => id.startsWith('theme-'))).toBe(true)
  })
})
