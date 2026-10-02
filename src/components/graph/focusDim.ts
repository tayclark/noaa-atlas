/** Which nodes stay at full strength while the rest of the graph dims (search #33, selection #255). */
export function focusIds(matchedIds: ReadonlySet<string> | null, highlightedIds: readonly string[]): Set<string> | null {
  if (matchedIds) return new Set([...matchedIds, ...highlightedIds])
  return highlightedIds.length > 0 ? new Set(highlightedIds) : null
}

export function isNodeDimmed(focus: ReadonlySet<string> | null, id: string): boolean {
  return focus !== null && !focus.has(id)
}

/**
 * Search keeps an edge only when both ends match. A selection also keeps every edge touching a
 * highlighted node, so the selected node's connections stay readable.
 */
export function isEdgeDimmed(
  focus: ReadonlySet<string> | null,
  matchedIds: ReadonlySet<string> | null,
  highlightedIds: readonly string[],
  source: string,
  target: string,
): boolean {
  if (focus === null) return false
  if (focus.has(source) && focus.has(target)) return false
  if (matchedIds) return true
  return !(highlightedIds.includes(source) || highlightedIds.includes(target))
}
