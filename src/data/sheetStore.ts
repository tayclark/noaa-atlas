// Where the detail sheet is on a phone (#78), so the graph can frame a selection into what the
// sheet leaves free: along the bottom in portrait, down the right-hand side in landscape. A
// module-level store like selectionStore.ts: the sheet writes it and the graph reads it with
// `useSyncExternalStore`. Null means there is no sheet.

import { createStore } from './createStore'

export interface SheetBox {
  edge: 'bottom' | 'right'
  /** How far (px) it reaches in from that edge: its height at the bottom, its width at the right. */
  size: number
}

const store = createStore<SheetBox | null>(null, (a, b) => a?.edge === b?.edge && a?.size === b?.size)

export function setSheetBox(next: SheetBox | null): void {
  const size = next ? Math.max(0, Math.round(next.size)) : 0
  store.set(next && size > 0 ? { edge: next.edge, size } : null)
}

export const subscribeSheetBox = store.subscribe
/** The same object until the sheet moves, as `useSyncExternalStore` needs. */
export const getSheetBoxSnapshot = store.get
