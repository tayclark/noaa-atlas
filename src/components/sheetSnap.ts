// Where the detail sheet (#78) comes to rest when a finger lets go of it. Pure, so the drag rules are
// unit-tested without a browser. The sheet has two heights, peek (just its header) and open (nearly
// all of the area it sits in, leaving a strip of what is behind it), and can be dismissed by pulling
// it down from peek.

/** The strip of the area left uncovered when the sheet is open. */
export const OPEN_MARGIN = 56

/** How far ahead of the finger (ms) a flick carries the sheet. */
const PROJECT_MS = 250

/** A sheet pulled below this share of its peek height is dismissed. */
const CLOSE_BELOW = 0.6

export type SheetHeights = readonly [peek: number, open: number]

export type SheetRest = 'peek' | 'open' | 'close'

/** The two resting heights (px) for an area `areaHeight` tall and a header `headerHeight` tall. */
export function sheetHeights(areaHeight: number, headerHeight: number): SheetHeights {
  const peek = Math.min(headerHeight, areaHeight)
  return [peek, Math.max(peek, areaHeight - OPEN_MARGIN)]
}

/**
 * Where a drag that ended at `height` rests. `velocity` is in px/ms and positive when the sheet was
 * growing (the finger moving up), so a short flick carries it as far as a long slow drag would.
 * `from` is where the drag began: only a sheet that started at peek can be dismissed, so a hard
 * flick down from open stops at peek rather than losing the selection.
 */
export function restingSnap(height: number, velocity: number, [peek, open]: SheetHeights, from: 'peek' | 'open'): SheetRest {
  const projected = height + velocity * PROJECT_MS
  if (from === 'peek' && projected < peek * CLOSE_BELOW) return 'close'
  return projected - peek <= open - projected ? 'peek' : 'open'
}
