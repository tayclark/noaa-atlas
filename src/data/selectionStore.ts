// Single source of truth for the current selection (a graph node or a globe point), shared
// between the globe and graph views (#43). Kept as a module-level store rather than React
// context/state, matching requestLog.ts's convention — components read it via
// `useSyncExternalStore`.

import graphJson from './graph.json'
import type { ServiceNode } from './graphSchema'
import { parseGraphFile } from './graphSchema'
import type { LonLat } from './coverageLookup'
import { nodesCoveringPoint } from './coverageLookup'

export interface Selection {
  selectedNodeId: string | null
  selectedPoint: LonLat | null
}

const graphNodes: ServiceNode[] = parseGraphFile(graphJson).nodes as ServiceNode[]

let selection: Selection = { selectedNodeId: null, selectedPoint: null }
const listeners = new Set<() => void>()

/** Selects a graph node by id, clearing any point selection (selection is mutually exclusive). */
export function selectNode(nodeId: string): void {
  selection = { selectedNodeId: nodeId, selectedPoint: null }
  for (const listener of listeners) listener()
}

/** Selects a globe point, clearing any node selection (selection is mutually exclusive). */
export function selectPoint(point: LonLat): void {
  selection = { selectedNodeId: null, selectedPoint: point }
  for (const listener of listeners) listener()
}

/** Clears the current selection. Also intended for test isolation between cases. */
export function clearSelection(): void {
  selection = { selectedNodeId: null, selectedPoint: null }
  for (const listener of listeners) listener()
}

export function subscribeSelection(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSelectionSnapshot(): Selection {
  return selection
}

/** Derived highlights: node ids implied by the current selection (the selected node itself, or every node covering the selected point). */
export function getHighlightedNodeIds(): string[] {
  if (selection.selectedNodeId) return [selection.selectedNodeId]
  if (selection.selectedPoint) return nodesCoveringPoint(graphNodes, selection.selectedPoint).map((n) => n.id)
  return []
}
