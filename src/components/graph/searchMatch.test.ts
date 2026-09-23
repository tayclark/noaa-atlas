import { describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import tasksJson from '../../data/tasks.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile } from '../../data/graphSchema'
import { parseTasksFile } from '../../data/taskSchema'
import { buildSearchIndex, matchNodeIds } from './searchMatch'

const graph = buildGraph(parseGraphFile(graphJson))
const { tasks } = parseTasksFile(tasksJson)
const index = buildSearchIndex(graph.nodes, tasks)

describe('matchNodeIds', () => {
  it('returns null for an empty or whitespace-only query', () => {
    expect(matchNodeIds(index, '')).toBeNull()
    expect(matchNodeIds(index, '   ')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(matchNodeIds(index, 'TORNADO')?.has('spc-gis-data')).toBe(true)
  })

  it('matches tags and requires every term (AND)', () => {
    expect(matchNodeIds(index, 'tornado')?.has('spc-gis-data')).toBe(true)
    expect(matchNodeIds(index, 'tornado')?.has('nws-api')).toBe(false)
    expect(matchNodeIds(index, 'tornado alerts')?.has('spc-gis-data')).toBe(false)
  })

  it('matches names, formats and owner program', () => {
    expect(matchNodeIds(index, 'nws api')?.has('nws-api')).toBe(true)
    expect(matchNodeIds(index, 'geojson')?.has('nws-api')).toBe(true)
    expect(matchNodeIds(index, 'storm prediction')?.has('spc-gis-data')).toBe(true)
  })

  it('matches theme hubs by their label only', () => {
    const hub = graph.nodes.find((n) => n.kind === 'theme' && n.theme === 'weather')!
    expect(matchNodeIds(index, hub.name)?.has(hub.id)).toBe(true)
    expect(matchNodeIds(index, 'tornado')?.has(hub.id)).toBe(false)
  })

  it('returns an empty set when nothing matches', () => {
    expect(matchNodeIds(index, 'xyzzy')?.size).toBe(0)
  })

  it('matches task labels for the nodes a task references', () => {
    for (const task of tasks) {
      const matches = matchNodeIds(index, task.label)
      for (const { nodeId } of task.nodes) expect(matches?.has(nodeId)).toBe(true)
    }
  })

  it('gives every node a non-empty haystack', () => {
    for (const node of graph.nodes) expect(index.get(node.id)?.length).toBeGreaterThan(0)
  })
})
