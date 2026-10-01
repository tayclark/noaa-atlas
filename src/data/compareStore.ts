// The set of services picked for the Compare tab (#76). A module-level store like selectionStore.ts
// and requestLog.ts, read with `useSyncExternalStore`. Kept apart from the selection, which is a
// single value shared by the finder, graph and globe: a comparison set outlives any one selection.

import graphJson from './graph.json'
import { parseGraphFile } from './graphSchema'

/** More columns than this stop fitting side by side, even in a wide pane. */
export const MAX_COMPARE = 6

const serviceIds = new Set(
  parseGraphFile(graphJson)
    .nodes.filter((node) => node.kind === 'service')
    .map((node) => node.id),
)

let compareIds: readonly string[] = []
const listeners = new Set<() => void>()

function setIds(next: readonly string[]): void {
  compareIds = next
  for (const listener of listeners) listener()
}

/** Adds the id, or removes it when already picked. Ignores unknown and non-service ids, and a full set. */
export function toggleCompare(nodeId: string): void {
  if (compareIds.includes(nodeId)) return setIds(compareIds.filter((id) => id !== nodeId))
  addCompare([nodeId])
}

/** Appends the service ids not already picked, in order, until the set is full. */
export function addCompare(nodeIds: readonly string[]): void {
  const next = [...compareIds]
  for (const id of nodeIds) {
    if (next.length >= MAX_COMPARE) break
    if (serviceIds.has(id) && !next.includes(id)) next.push(id)
  }
  if (next.length !== compareIds.length) setIds(next)
}

export function removeCompare(nodeId: string): void {
  if (compareIds.includes(nodeId)) setIds(compareIds.filter((id) => id !== nodeId))
}

/** Empties the set. Also intended for test isolation between cases. */
export function clearCompare(): void {
  if (compareIds.length > 0) setIds([])
}

export function subscribeCompare(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCompareSnapshot(): readonly string[] {
  return compareIds
}
