// The graph's nodes share one Tab stop (#284): only one of them is in the Tab order, and the arrow
// keys, Home and End move focus between them, so a keyboard user isn't walked through ~90 stops to
// reach the globe. The order is fixed (root, then each theme's hub and its services by name) rather
// than read from the layout, so a walk is the same on every load.

import { THEMES } from '../../data/graphSchema'
import { isNodeVisible, NO_INSET, type FitTransform, type Inset, type LayoutMode, type LayoutNode } from './graphLayout'

const themeRank = (node: LayoutNode) => (node.kind === 'service' || node.kind === 'theme' ? THEMES.indexOf(node.theme) : -1)
// Within a theme the hub comes first, then its services.
const kindRank = (node: LayoutNode) => (node.kind === 'root' ? 0 : node.kind === 'theme' ? 1 : 2)

/** Ids of the focusable nodes shown in `mode`, in keyboard order. The org and access hubs aren't focusable. */
export function rovingOrder(nodes: readonly LayoutNode[], mode: LayoutMode): string[] {
  return nodes
    .filter((node) => (node.kind === 'service' || node.kind === 'theme' || node.kind === 'root') && isNodeVisible(node, mode))
    .sort((a, b) => themeRank(a) - themeRank(b) || kindRank(a) - kindRank(b) || a.name.localeCompare(b.name))
    .map((node) => node.id)
}

/** The node that holds the Tab stop: the one last focused, else the selected one, else the first shown. */
export function rovingTabStop(order: readonly string[], lastFocusedId: string | null, selectedId: string | null): string | null {
  if (lastFocusedId && order.includes(lastFocusedId)) return lastFocusedId
  if (selectedId && order.includes(selectedId)) return selectedId
  return order[0] ?? null
}

/** Where a roving key moves focus from `currentId`, or null for any other key. The arrows wrap. */
export function rovingTarget(order: readonly string[], currentId: string, key: string): string | null {
  if (order.length === 0) return null
  const last = order.length - 1
  const index = order.indexOf(currentId)
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return order[index < 0 || index === last ? 0 : index + 1] ?? null
    case 'ArrowLeft':
    case 'ArrowUp':
      return order[index <= 0 ? last : index - 1] ?? null
    case 'Home':
      return order[0] ?? null
    case 'End':
      return order[last] ?? null
    default:
      return null
  }
}

/**
 * The transform that pans a node at layout position `pos` into view, at least `margin` px inside
 * the part of the viewport the inset (the detail panel) leaves free, or null when it is already
 * there. The scale is kept, and the pan is the smallest that reveals the node.
 */
export function revealTransform(
  current: FitTransform,
  pos: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  margin: number,
  inset: Inset = NO_INSET,
): FitTransform | null {
  const shift = (screen: number, start: number, end: number) => {
    const mid = (start + end) / 2
    const lo = Math.min(start + margin, mid)
    const hi = Math.max(end - margin, mid)
    return screen < lo ? lo - screen : screen > hi ? hi - screen : 0
  }
  const dx = shift(current.x + pos.x * current.k, inset.left, viewportWidth - inset.right)
  const dy = shift(current.y + pos.y * current.k, inset.top, viewportHeight - inset.bottom)
  return dx === 0 && dy === 0 ? null : { x: current.x + dx, y: current.y + dy, k: current.k }
}
