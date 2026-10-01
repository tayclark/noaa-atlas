// How tall the detail sheet is on a phone (#78), so the graph can frame a selection into what the
// sheet leaves free. A module-level store like selectionStore.ts: the sheet writes it and the graph
// reads it with `useSyncExternalStore`. Zero means there is no sheet.

let height = 0
const listeners = new Set<() => void>()

export function setSheetHeight(px: number): void {
  const next = Math.max(0, Math.round(px))
  if (next === height) return
  height = next
  for (const listener of listeners) listener()
}

export function subscribeSheetHeight(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSheetHeight(): number {
  return height
}
