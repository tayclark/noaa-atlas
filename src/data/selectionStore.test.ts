import { beforeEach, describe, expect, it, vi } from 'vitest'
import graphJson from './graph.json'
import type { ServiceNode } from './graphSchema'
import { parseGraphFile } from './graphSchema'
import { nodesCoveringPoint } from './coverageLookup'
import {
  clearSelection,
  getHighlightedNodeIds,
  getSelectedTaskPath,
  getSelectionSnapshot,
  selectNode,
  selectPoint,
  selectTask,
  subscribeSelection,
} from './selectionStore'
import { parseTasksFile } from './taskSchema'
import tasksJson from './tasks.json'

const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]
const tasks = parseTasksFile(tasksJson).tasks
const task = tasks[0]!
const kansas: [number, number] = [-98, 39] // covered by nws-api and spc-gis-data
const guineaGulf: [number, number] = [0, 0] // outside all region-limited coverage

beforeEach(() => {
  clearSelection()
})

describe('selectNode', () => {
  it('sets selectedNodeId and clears any prior selectedPoint', () => {
    selectPoint(kansas)
    selectNode('nws-api')
    expect(getSelectionSnapshot()).toEqual({ selectedNodeId: 'nws-api', selectedPoint: null, selectedTaskId: null })
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    subscribeSelection(listener)
    selectNode('nws-api')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('selectPoint', () => {
  it('sets selectedPoint and clears any prior selectedNodeId', () => {
    selectNode('nws-api')
    selectPoint(kansas)
    expect(getSelectionSnapshot()).toEqual({ selectedNodeId: null, selectedPoint: kansas, selectedTaskId: null })
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    subscribeSelection(listener)
    selectPoint(kansas)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('selectTask', () => {
  it('sets selectedTaskId and clears any prior node/point selection', () => {
    selectNode('nws-api')
    selectTask(task.id)
    expect(getSelectionSnapshot()).toEqual({ selectedNodeId: null, selectedPoint: null, selectedTaskId: task.id })
    selectPoint(kansas)
    selectTask(task.id)
    expect(getSelectionSnapshot().selectedPoint).toBeNull()
  })

  it('is cleared by selectNode and selectPoint', () => {
    selectTask(task.id)
    selectNode('nws-api')
    expect(getSelectionSnapshot().selectedTaskId).toBeNull()
    selectTask(task.id)
    selectPoint(kansas)
    expect(getSelectionSnapshot().selectedTaskId).toBeNull()
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    subscribeSelection(listener)
    selectTask(task.id)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('clearSelection', () => {
  it('resets every field to null', () => {
    selectNode('nws-api')
    clearSelection()
    expect(getSelectionSnapshot()).toEqual({ selectedNodeId: null, selectedPoint: null, selectedTaskId: null })
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    subscribeSelection(listener)
    selectNode('nws-api')
    clearSelection()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('subscribeSelection', () => {
  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSelection(listener)
    selectNode('nws-api')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    selectPoint(kansas)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('getSelectionSnapshot', () => {
  it('returns a stable reference when nothing has changed', () => {
    selectNode('nws-api')
    expect(getSelectionSnapshot()).toBe(getSelectionSnapshot())
  })

  it('returns a new reference after a mutation', () => {
    const before = getSelectionSnapshot()
    selectNode('nws-api')
    expect(getSelectionSnapshot()).not.toBe(before)
  })
})

describe('getHighlightedNodeIds', () => {
  it('returns an empty array when nothing is selected', () => {
    expect(getHighlightedNodeIds()).toEqual([])
  })

  it('returns just the selected node id after selectNode', () => {
    selectNode('nws-api')
    expect(getHighlightedNodeIds()).toEqual(['nws-api'])
  })

  it('returns the ids of all nodes covering the selected point', () => {
    selectPoint(kansas)
    const expected = nodesCoveringPoint(nodes, kansas).map((n) => n.id)
    expect(getHighlightedNodeIds().sort()).toEqual(expected.sort())
    expect(getHighlightedNodeIds()).toContain('nws-api')
    expect(getHighlightedNodeIds()).toContain('spc-gis-data')
  })

  it('returns an empty array when the selected point is outside all coverage', () => {
    selectPoint(guineaGulf)
    expect(getHighlightedNodeIds()).not.toContain('spc-gis-data')
    expect(getHighlightedNodeIds()).not.toContain('wpc-gis-products')
  })

  it("returns the selected task's node ids in path order", () => {
    selectTask(task.id)
    expect(getHighlightedNodeIds()).toEqual(task.nodes.map((n) => n.nodeId))
  })

  it('returns an empty array again after clearSelection', () => {
    selectNode('nws-api')
    clearSelection()
    expect(getHighlightedNodeIds()).toEqual([])
  })
})

describe('getSelectedTaskPath', () => {
  it('is empty when no task is selected', () => {
    expect(getSelectedTaskPath()).toEqual([])
    selectNode('nws-api')
    expect(getSelectedTaskPath()).toEqual([])
  })

  it('is empty for an unknown task id', () => {
    selectTask('no-such-task')
    expect(getSelectedTaskPath()).toEqual([])
  })

  it("returns the selected task's ordered node ids, all of which exist in graph.json", () => {
    for (const t of tasks) {
      selectTask(t.id)
      const path = getSelectedTaskPath()
      expect(path).toEqual(t.nodes.map((n) => n.nodeId))
      for (const id of path) expect(nodes.some((n) => n.id === id)).toBe(true)
    }
  })
})
