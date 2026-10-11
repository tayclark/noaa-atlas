// The set of services picked for the Compare tab (#76). A module-level store (createStore.ts), read
// with `useSyncExternalStore`. Kept apart from the selection, which is a single value shared by the
// finder, graph and globe: a comparison set outlives any one selection.

import { createStore } from './createStore'
import { graphFile } from './graphData'

/** More columns than this stop fitting side by side, even in a wide pane. */
export const MAX_COMPARE = 6

const serviceIds = new Set(
  graphFile.nodes
    .filter((node) => node.kind === 'service')
    .map((node) => node.id),
)

// Two id lists are the same set here when they match in order, which keeps the snapshot stable.
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i])

const store = createStore<readonly string[]>([], sameIds)

/** Adds the id, or removes it when already picked. Ignores unknown and non-service ids, and a full set. */
export function toggleCompare(nodeId: string): void {
  const ids = store.get()
  if (ids.includes(nodeId)) return store.set(ids.filter((id) => id !== nodeId))
  addCompare([nodeId])
}

/** Appends the service ids not already picked, in order, until the set is full. */
export function addCompare(nodeIds: readonly string[]): void {
  const next = [...store.get()]
  for (const id of nodeIds) {
    if (next.length >= MAX_COMPARE) break
    if (serviceIds.has(id) && !next.includes(id)) next.push(id)
  }
  store.set(next)
}

export function removeCompare(nodeId: string): void {
  store.set(store.get().filter((id) => id !== nodeId))
}

/** Empties the set. Also intended for test isolation between cases. */
export function clearCompare(): void {
  store.set([])
}

export const subscribeCompare = store.subscribe
export const getCompareSnapshot = store.get
