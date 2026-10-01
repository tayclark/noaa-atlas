// Where the detail sheet is on a phone (#78), so the graph can frame a selection into what the
// sheet leaves free: along the bottom in portrait, down the right-hand side in landscape. A
// module-level store like selectionStore.ts: the sheet writes it and the graph reads it with
// `useSyncExternalStore`. Null means there is no sheet.

export interface SheetBox {
  edge: 'bottom' | 'right'
  /** How far (px) it reaches in from that edge: its height at the bottom, its width at the right. */
  size: number
}

let box: SheetBox | null = null
const listeners = new Set<() => void>()

export function setSheetBox(next: SheetBox | null): void {
  const size = next ? Math.max(0, Math.round(next.size)) : 0
  const rounded = next && size > 0 ? { edge: next.edge, size } : null
  if (rounded?.edge === box?.edge && rounded?.size === box?.size) return
  box = rounded
  for (const listener of listeners) listener()
}

export function subscribeSheetBox(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The same object until the sheet moves, as `useSyncExternalStore` needs. */
export function getSheetBox(): SheetBox | null {
  return box
}
