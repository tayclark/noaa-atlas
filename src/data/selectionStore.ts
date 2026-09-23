// Single source of truth for the current selection (a graph node or a globe point), shared
// between the globe and graph views (#43). Kept as a module-level store rather than React
// context/state, matching requestLog.ts's convention — components read it via
// `useSyncExternalStore`.

import graphJson from './graph.json'
import type { ServiceNode } from './graphSchema'
import { parseGraphFile } from './graphSchema'
import type { LonLat } from './coverageLookup'
import { nodesCoveringPoint } from './coverageLookup'
import { parseTasksFile } from './taskSchema'
import tasksJson from './tasks.json'

export interface Selection {
  selectedNodeId: string | null
  selectedPoint: LonLat | null
  selectedTaskId: string | null
}

const graphNodes: ServiceNode[] = parseGraphFile(graphJson).nodes as ServiceNode[]
const tasks = parseTasksFile(tasksJson).tasks

let selection: Selection = { selectedNodeId: null, selectedPoint: null, selectedTaskId: null }
const listeners = new Set<() => void>()

/** Selects a graph node by id, clearing any point/task selection (selection is mutually exclusive). */
export function selectNode(nodeId: string): void {
  selection = { selectedNodeId: nodeId, selectedPoint: null, selectedTaskId: null }
  for (const listener of listeners) listener()
}

/** Selects a globe point, clearing any node/task selection (selection is mutually exclusive). */
export function selectPoint(point: LonLat): void {
  selection = { selectedNodeId: null, selectedPoint: point, selectedTaskId: null }
  for (const listener of listeners) listener()
}

/** Selects an "I need…" task (#34), clearing any node/point selection (selection is mutually exclusive). */
export function selectTask(taskId: string): void {
  selection = { selectedNodeId: null, selectedPoint: null, selectedTaskId: taskId }
  for (const listener of listeners) listener()
}

/** Clears the current selection. Also intended for test isolation between cases. */
export function clearSelection(): void {
  selection = { selectedNodeId: null, selectedPoint: null, selectedTaskId: null }
  for (const listener of listeners) listener()
}

export function subscribeSelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSelectionSnapshot(): Selection {
  return selection
}

/** Ordered node ids of the selected task's recommended path (empty when no task is selected). */
export function getSelectedTaskPath(): string[] {
  const task = tasks.find((t) => t.id === selection.selectedTaskId)
  return task ? task.nodes.map((n) => n.nodeId) : []
}

/** Derived highlights: node ids implied by the current selection (the selected node itself, the selected task's path, or every node covering the selected point). */
export function getHighlightedNodeIds(): string[] {
  if (selection.selectedNodeId) return [selection.selectedNodeId]
  if (selection.selectedTaskId) return getSelectedTaskPath()
  if (selection.selectedPoint) return nodesCoveringPoint(graphNodes, selection.selectedPoint).map((n) => n.id)
  return []
}
