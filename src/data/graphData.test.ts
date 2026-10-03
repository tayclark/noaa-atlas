import { describe, expect, it } from 'vitest'
import { buildGraph } from './buildGraph'
import { graph, graphFile, tasks } from './graphData'
import graphJson from './graph.json'
import { parseGraphFile } from './graphSchema'
import tasksJson from './tasks.json'
import { parseTasksFile } from './taskSchema'

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('graphData', () => {
  it('holds the parsed graph.json, the built graph and the tasks', () => {
    expect(graphFile).toEqual(parseGraphFile(graphJson))
    expect(graph).toEqual(buildGraph(parseGraphFile(graphJson)))
    expect(tasks).toEqual(parseTasksFile(tasksJson).tasks)
  })

  it('is the only runtime module that parses graph.json or tasks.json (#270)', () => {
    // graphSchema.ts and taskSchema.ts define the parsers, so they're allowed to name them.
    const allowed = new Set(['/src/data/graphData.ts', '/src/data/graphSchema.ts', '/src/data/taskSchema.ts'])
    const parsers = Object.entries(sources)
      .filter(([path, source]) => !allowed.has(path) && /from '[^']*\/(?:graph|tasks)\.json'|parse(?:Graph|Tasks)File\(/.test(source))
      .map(([path]) => path)
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    expect(parsers).toEqual([])
  })
})
