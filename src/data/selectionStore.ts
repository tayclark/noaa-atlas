// Single source of truth for the current selection (a graph node, a globe point or a task), shared
// between the globe and graph views (#43). A module-level store (createStore.ts) that components
// read via `useSyncExternalStore`. It notifies only when the selection actually changes.

import { createStore } from './createStore'
import { graphFile, tasks } from './graphData'
import type { ServiceNode } from './graphSchema'
import type { LonLat } from './coverageLookup'
import { nodesCoveringPoint } from './coverageLookup'

export interface Selection {
  selectedNodeId: string | null
  selectedPoint: LonLat | null
  selectedTaskId: string | null
}

const graphNodes: ServiceNode[] = graphFile.nodes

const NONE: Selection = { selectedNodeId: null, selectedPoint: null, selectedTaskId: null }

const samePoint = (a: LonLat | null, b: LonLat | null) => a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1])
const sameSelection = (a: Selection, b: Selection) =>
  a.selectedNodeId === b.selectedNodeId && a.selectedTaskId === b.selectedTaskId && samePoint(a.selectedPoint, b.selectedPoint)

const store = createStore<Selection>(NONE, sameSelection)

/** Selects a graph node by id, clearing any point/task selection (selection is mutually exclusive). */
export function selectNode(nodeId: string): void {
  store.set({ ...NONE, selectedNodeId: nodeId })
}

/** Selects a globe point, clearing any node/task selection (selection is mutually exclusive). */
export function selectPoint(point: LonLat): void {
  store.set({ ...NONE, selectedPoint: point })
}

/** Selects an "I need…" task (#34), clearing any node/point selection (selection is mutually exclusive). */
export function selectTask(taskId: string): void {
  store.set({ ...NONE, selectedTaskId: taskId })
}

/** Clears the current selection. Also intended for test isolation between cases. */
export function clearSelection(): void {
  store.set(NONE)
}

export const subscribeSelection = store.subscribe
export const getSelectionSnapshot = store.get

/** Whether anything (a node, a point or a task) is selected. */
export function hasSelection(): boolean {
  return !sameSelection(store.get(), NONE)
}

/** Ordered node ids of the selected task's recommended path (empty when no task is selected). */
export function getSelectedTaskPath(): string[] {
  const selection = store.get()
  const task = tasks.find((t) => t.id === selection.selectedTaskId)
  return task ? task.nodes.map((n) => n.nodeId) : []
}

/** Derived highlights: node ids implied by the current selection (the selected node itself, the selected task's path, or every node covering the selected point). */
export function getHighlightedNodeIds(): string[] {
  const selection = store.get()
  if (selection.selectedNodeId) return [selection.selectedNodeId]
  if (selection.selectedTaskId) return getSelectedTaskPath()
  if (selection.selectedPoint) return nodesCoveringPoint(graphNodes, selection.selectedPoint).map((n) => n.id)
  return []
}
