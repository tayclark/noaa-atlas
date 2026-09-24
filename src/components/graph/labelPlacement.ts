// Greedy label decluttering for the graph (#138). Pure: screen-space boxes in, a side per label
// (or null to hide it) out, so it's unit-testable without a DOM.

export type LabelSide = 'right' | 'left' | 'below' | 'above' | 'upper-right' | 'lower-right' | 'upper-left' | 'lower-left'

// The diagonals come last, so they only take labels that fit nowhere else (#145).
const SIDES: readonly LabelSide[] = ['right', 'left', 'below', 'above', 'upper-right', 'lower-right', 'upper-left', 'lower-left']

export interface LabelItem {
  id: string
  /** Node centre in screen pixels. */
  x: number
  y: number
  /** Node radius in screen pixels. */
  radius: number
  width: number
  height: number
  /** Higher places first and wins contested space. */
  priority: number
  /** May cover other nodes' circles (still never another label). */
  overNodes?: boolean
}

export interface Bounds {
  width: number
  height: number
}

/** Gap between the node edge and its label, in screen pixels. */
export const LABEL_GAP = 4
/** A diagonal label's corner sits this fraction of (radius + gap) off the node centre on each axis. */
export const DIAGONAL_OFFSET = 0.7
/** Clearance kept around every placed label, so real text bounds (which vary a pixel or two from the estimate) never touch. */
const LABEL_MARGIN = 2

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const intersects = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

function labelBox(item: LabelItem, side: LabelSide): Box {
  const offset = item.radius + LABEL_GAP
  if (side.includes('-')) {
    const d = offset * DIAGONAL_OFFSET
    const x0 = side.endsWith('right') ? item.x + d : item.x - d - item.width
    const y0 = side.startsWith('lower') ? item.y + d : item.y - d - item.height
    return { x0, y0, x1: x0 + item.width, y1: y0 + item.height }
  }
  if (side === 'right' || side === 'left') {
    const x0 = side === 'right' ? item.x + offset : item.x - offset - item.width
    return { x0, y0: item.y - item.height / 2, x1: x0 + item.width, y1: item.y + item.height / 2 }
  }
  const x0 = item.x - item.width / 2
  const y0 = side === 'below' ? item.y + offset : item.y - offset - item.height
  return { x0, y0, x1: x0 + item.width, y1: y0 + item.height }
}

/**
 * Places labels highest priority first (ties broken by id, so the result is stable), trying
 * right of the node, then left, below, above and the four diagonals. A label that fits in none of them without leaving
 * the bounds or overlapping an already placed label or (unless overNodes) any node gets null.
 */
export function placeLabels(
  items: readonly LabelItem[],
  bounds: Bounds,
  /** Screen areas no label may enter, such as a panel drawn over the graph. */
  obstacles: readonly Box[] = [],
): Map<string, LabelSide | null> {
  const nodeBoxes = items.map((item) => ({
    id: item.id,
    box: { x0: item.x - item.radius, y0: item.y - item.radius, x1: item.x + item.radius, y1: item.y + item.radius },
  }))
  const placed: Box[] = [...obstacles]
  const result = new Map<string, LabelSide | null>()
  const ordered = [...items].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))

  for (const item of ordered) {
    const side = SIDES.find((candidate) => {
      const box = labelBox(item, candidate)
      if (box.x0 < 0 || box.y0 < 0 || box.x1 > bounds.width || box.y1 > bounds.height) return false
      if (placed.some((other) => intersects(box, other))) return false
      return item.overNodes || !nodeBoxes.some((node) => node.id !== item.id && intersects(box, node.box))
    })
    result.set(item.id, side ?? null)
    if (side) {
      const box = labelBox(item, side)
      placed.push({ x0: box.x0 - LABEL_MARGIN, y0: box.y0 - LABEL_MARGIN, x1: box.x1 + LABEL_MARGIN, y1: box.y1 + LABEL_MARGIN })
    }
  }
  return result
}
