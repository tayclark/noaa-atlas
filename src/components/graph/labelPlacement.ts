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
  /** Breaks ties within a priority (larger or better connected first), before falling back to id. */
  rank?: number
  /** May cover other nodes' circles (still never another label). */
  overNodes?: boolean
}

export interface Bounds {
  width: number
  height: number
}

/** Labels render at this size on screen at every zoom level (#138); overlaps are hidden instead. */
export const LABEL_PX = 12
/** The height of the box a label reserves, in screen pixels. */
export const LABEL_HEIGHT = 13
/** Gap between the node edge and its label, in screen pixels. */
export const LABEL_GAP = 4
/** A diagonal label's corner sits this fraction of (radius + gap) off the node centre on each axis. */
export const DIAGONAL_OFFSET = 0.7
/** Clearance kept around every placed label, so real text bounds (which vary a pixel or two from the estimate) never touch. */
const LABEL_MARGIN = 2
/**
 * A label that fits nowhere clean may still graze a neighbour's dot: in the second pass each dot's
 * collision box shrinks to this fraction of its radius, so only a label reaching a dot's core is refused (#176).
 */
export const DOT_OVERLAP_TOLERANCE = 0.5

/** Priority from which a label is always eligible, whatever the budget: the selection, search matches and theme hubs. */
export const BUDGET_EXEMPT_PRIORITY = 3
/**
 * Labels allowed at the least zoom. The default fit lands at k ≈ 0.4-0.7 in every view at
 * 1280x720, 1400x900 and a 390x844 phone (#292), where the k² term below gives only 3-8, so this
 * floor sets the first view: the exempt hubs plus up to eight service labels (fewer where space
 * runs out), none overlapping.
 */
const MIN_LABEL_BUDGET = 8
/**
 * Labels allowed at zoom 1. The budget grows with the screen area, so with k squared, and takes
 * over from the floor only once the user zooms in (#292 checked the steps stay legible).
 */
const LABELS_AT_UNIT_ZOOM = 16

/** How many labels the graph may show at zoom level k, so a zoomed-out view keeps only its biggest nodes' labels. */
export function labelBudget(k: number, total: number): number {
  return Math.min(total, Math.max(MIN_LABEL_BUDGET, Math.round(LABELS_AT_UNIT_ZOOM * k * k)))
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A screen rect as a Box in the space of `origin` (the SVG's rect), or null for an empty (unrendered) rect. */
export function boxRelativeTo(rect: DOMRectReadOnly, origin: DOMRectReadOnly): Box | null {
  if (rect.width === 0 || rect.height === 0) return null
  return { x0: rect.left - origin.left, y0: rect.top - origin.top, x1: rect.right - origin.left, y1: rect.bottom - origin.top }
}

const intersects = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** The screen box a label on `side` of `item` takes. */
export function labelBox(item: LabelItem, side: LabelSide): Box {
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
 * Those are retried in a second pass that lets them graze the outer edge of a neighbouring dot
 * (see DOT_OVERLAP_TOLERANCE), so no label placed in the first pass ever moves.
 */
export function placeLabels(
  items: readonly LabelItem[],
  bounds: Bounds,
  /** Screen areas no label may enter, such as a panel drawn over the graph. */
  obstacles: readonly Box[] = [],
  /** At most this many labels are eligible, highest priority first; priority BUDGET_EXEMPT_PRIORITY and up never counts against it. */
  maxLabels = Infinity,
): Map<string, LabelSide | null> {
  const dotBoxes = (scale: number) =>
    items.map((item) => {
      const r = item.radius * scale
      return { id: item.id, box: { x0: item.x - r, y0: item.y - r, x1: item.x + r, y1: item.y + r } }
    })
  const strictDots = dotBoxes(1)
  const softDots = dotBoxes(DOT_OVERLAP_TOLERANCE)
  const placed: Box[] = [...obstacles]
  const result = new Map<string, LabelSide | null>()
  const sorted = [...items].sort((a, b) => b.priority - a.priority || (b.rank ?? 0) - (a.rank ?? 0) || a.id.localeCompare(b.id))
  let budgeted = 0
  const ordered = sorted.filter((item) => item.priority >= BUDGET_EXEMPT_PRIORITY || budgeted++ < maxLabels)
  for (const item of sorted) if (!ordered.includes(item)) result.set(item.id, null)

  const place = (item: LabelItem, dots: typeof strictDots) => {
    const side = SIDES.find((candidate) => {
      const box = labelBox(item, candidate)
      if (box.x0 < 0 || box.y0 < 0 || box.x1 > bounds.width || box.y1 > bounds.height) return false
      if (placed.some((other) => intersects(box, other))) return false
      return item.overNodes || !dots.some((node) => node.id !== item.id && intersects(box, node.box))
    })
    result.set(item.id, side ?? null)
    if (side) {
      const box = labelBox(item, side)
      placed.push({ x0: box.x0 - LABEL_MARGIN, y0: box.y0 - LABEL_MARGIN, x1: box.x1 + LABEL_MARGIN, y1: box.y1 + LABEL_MARGIN })
    }
  }

  for (const item of ordered) place(item, strictDots)
  for (const item of ordered) if (result.get(item.id) === null) place(item, softDots)
  return result
}

// Where the text's baseline sits in its LABEL_HEIGHT box, in screen pixels, for LABEL_PX text: below
// the centre of a box beside the node, below the top of one under it, above the bottom of one over it.
const BASELINE_BELOW_CENTRE = 4
const BASELINE_BELOW_TOP = 11
const BASELINE_ABOVE_BOTTOM = 3

export interface LabelAnchor {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
}

/**
 * The SVG text position (x, baseline y and text-anchor) for a label on `side` of a node of radius `r`,
 * relative to the node's centre in world units at zoom `k`, so the text lands in the box `labelBox`
 * reserved for it. A hidden label (null) keeps the default place, to the right.
 */
export function labelAnchor(side: LabelSide | null, r: number, k: number): LabelAnchor {
  // Positions are in world units (the zoom layer scales them), so screen gaps divide by k.
  const offset = r + LABEL_GAP / k
  const belowCentre = BASELINE_BELOW_CENTRE / k
  const belowTop = BASELINE_BELOW_TOP / k
  const aboveBottom = BASELINE_ABOVE_BOTTOM / k
  switch (side) {
    case 'left':
      return { x: -offset, y: belowCentre, anchor: 'end' }
    case 'below':
      return { x: 0, y: offset + belowTop, anchor: 'middle' }
    case 'above':
      return { x: 0, y: -(offset + aboveBottom), anchor: 'middle' }
    case 'upper-right':
    case 'upper-left':
    case 'lower-right':
    case 'lower-left': {
      // Diagonal labels (#145) hang off a corner offset * DIAGONAL_OFFSET from the centre.
      const d = offset * DIAGONAL_OFFSET
      const right = side.endsWith('right')
      return {
        x: right ? d : -d,
        y: side.startsWith('upper') ? -(d + aboveBottom) : d + belowTop,
        anchor: right ? 'start' : 'end',
      }
    }
    default:
      return { x: offset, y: belowCentre, anchor: 'start' }
  }
}

/**
 * Label priority (#138): what the user asked for wins space first (the selection, task path or globe
 * point, then search matches), then the hubs, then a single selected node's neighbours, then every
 * other service. From `hub` up a label is exempt from the zoom budget and may cover other dots.
 */
export const LABEL_PRIORITY = {
  service: 0,
  neighbor: 1,
  hub: BUDGET_EXEMPT_PRIORITY,
  match: 4,
  highlighted: 5,
} as const

/** The priority of a node `labelPriorities` didn't list. */
export const defaultLabelPriority = (isService: boolean): number => (isService ? LABEL_PRIORITY.service : LABEL_PRIORITY.hub)

/** Priorities by node id; a node in more than one group takes the highest. */
export function labelPriorities({
  highlightedIds,
  matchedIds,
  hubIds,
  neighborIds,
}: {
  highlightedIds: Iterable<string>
  matchedIds: Iterable<string> | null
  hubIds: Iterable<string>
  neighborIds: Iterable<string>
}): Map<string, number> {
  const priorities = new Map<string, number>()
  for (const id of neighborIds) priorities.set(id, LABEL_PRIORITY.neighbor)
  for (const id of hubIds) priorities.set(id, LABEL_PRIORITY.hub)
  for (const id of matchedIds ?? []) priorities.set(id, LABEL_PRIORITY.match)
  for (const id of highlightedIds) priorities.set(id, LABEL_PRIORITY.highlighted)
  return priorities
}
