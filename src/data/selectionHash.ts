// The selection as a URL hash (#266): `#node=<id>`, `#task=<id>` or `#point=<lon>,<lat>`, so an
// answer can be linked, survives a reload, and Back undoes it. A hash needs no routing on GitHub
// Pages. Pure, so it's unit-tested; urlSync.ts applies it to `location` and `history`.

import type { Selection } from './selectionStore'

export interface KnownIds {
  nodeIds: ReadonlySet<string>
  taskIds: ReadonlySet<string>
}

// About 11 m at the equator, plenty for "which APIs cover this spot".
const POINT_DECIMALS = 4

const EMPTY: Selection = { selectedNodeId: null, selectedPoint: null, selectedTaskId: null }

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function parseCoordinate(text: string | undefined, limit: number): number | null {
  // Number('') is 0 and Number(' 1') is 1, so the text's shape is checked first.
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null
  const value = Number(text)
  return Math.abs(value) <= limit ? value : null
}

/** The selection a hash names, or null when it is empty, unknown or malformed. */
export function parseSelectionHash(hash: string, known: KnownIds): Selection | null {
  const match = /^#?(node|task|point)=(.+)$/.exec(hash)
  if (!match) return null
  const [, kind, raw] = match
  const value = decode(raw as string)
  if (value === null) return null
  if (kind === 'node') return known.nodeIds.has(value) ? { ...EMPTY, selectedNodeId: value } : null
  if (kind === 'task') return known.taskIds.has(value) ? { ...EMPTY, selectedTaskId: value } : null
  const parts = value.split(',')
  if (parts.length !== 2) return null
  const lon = parseCoordinate(parts[0], 180)
  const lat = parseCoordinate(parts[1], 90)
  return lon === null || lat === null ? null : { ...EMPTY, selectedPoint: [lon, lat] }
}

const round = (n: number) => Number(n.toFixed(POINT_DECIMALS))

/** The hash for a selection, with its `#`, or '' when nothing is selected. */
export function formatSelectionHash(selection: Selection): string {
  if (selection.selectedNodeId) return `#node=${encodeURIComponent(selection.selectedNodeId)}`
  if (selection.selectedTaskId) return `#task=${encodeURIComponent(selection.selectedTaskId)}`
  if (selection.selectedPoint) {
    const [lon, lat] = selection.selectedPoint
    return `#point=${round(lon)},${round(lat)}`
  }
  return ''
}

/**
 * How a change of selection is written to history. A node or task is a step Back should undo, so
 * it gets an entry; a point (every tap on the globe) or clearing replaces the current one, so
 * history isn't flooded. The same hash writes nothing.
 */
export function historyModeFor(currentHash: string, next: Selection): 'push' | 'replace' | 'none' {
  const nextHash = formatSelectionHash(next)
  if (nextHash === currentHash) return 'none'
  return next.selectedNodeId || next.selectedTaskId ? 'push' : 'replace'
}
