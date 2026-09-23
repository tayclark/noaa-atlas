import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import { parseGraphFile } from './graphSchema'
import tasksJson from './tasks.json'
import { parseTasksFile } from './taskSchema'

describe('tasks.json', () => {
  it('validates against the tasks schema', () => {
    expect(() => parseTasksFile(tasksJson)).not.toThrow()
  })

  it('has at least one node ranking per task', () => {
    const { tasks } = parseTasksFile(tasksJson)
    for (const task of tasks) {
      expect(task.nodes.length).toBeGreaterThan(0)
    }
  })

  it('only references node ids that exist in graph.json', () => {
    const { tasks } = parseTasksFile(tasksJson)
    const realNodeIds = new Set(parseGraphFile(graphJson).nodes.map((node) => node.id))
    for (const task of tasks) {
      for (const { nodeId } of task.nodes) {
        expect(realNodeIds.has(nodeId), `task "${task.id}" references unknown node "${nodeId}"`).toBe(true)
      }
    }
  })

  it('has unique task ids', () => {
    const { tasks } = parseTasksFile(tasksJson)
    const ids = tasks.map((task) => task.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
