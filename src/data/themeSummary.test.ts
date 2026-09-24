import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import { buildGraph } from './buildGraph'
import { parseGraphFile, THEMES } from './graphSchema'
import { summarizeTheme } from './themeSummary'

const file = parseGraphFile(graphJson)
const graph = buildGraph(file)

describe('summarizeTheme', () => {
  it('lists exactly the services authored under the theme, sorted by name', () => {
    const { services } = summarizeTheme(graph, 'weather')
    const expected = file.nodes.filter((n) => n.theme === 'weather').map((n) => n.name)
    expect(services.map((n) => n.name)).toEqual([...expected].sort((a, b) => a.localeCompare(b)))
  })

  it('counts the live services', () => {
    const { services, live } = summarizeTheme(graph, 'weather')
    expect(live).toBe(services.filter((n) => n.liveLayer).length)
    expect(live).toBeGreaterThan(0)
  })

  it('accounts for every service exactly once across all themes', () => {
    const total = THEMES.reduce((sum, theme) => sum + summarizeTheme(graph, theme).services.length, 0)
    expect(total).toBe(file.nodes.length)
  })

  it('returns an empty summary for a theme with no services', () => {
    const empty = buildGraph({ ...file, nodes: file.nodes.filter((n) => n.theme !== 'hazards'), edges: [] })
    expect(summarizeTheme(empty, 'hazards')).toEqual({ services: [], live: 0 })
  })
})
