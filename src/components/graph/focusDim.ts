/** Which nodes stay at full strength while the rest of the graph dims (search #33, selection #255). */
export function focusIds(matchedIds: ReadonlySet<string> | null, highlightedIds: readonly string[]): Set<string> | null {
  if (matchedIds) return new Set([...matchedIds, ...highlightedIds])
  return highlightedIds.length > 0 ? new Set(highlightedIds) : null
}

/** Nodes one edge away from a highlighted node. Empty during search, which dims by match alone. */
export function neighborIds(
  edges: readonly { source: string; target: string }[],
  highlightedIds: readonly string[],
  matchedIds: ReadonlySet<string> | null,
): Set<string> {
  const near = new Set<string>()
  if (matchedIds || highlightedIds.length === 0) return near
  const highlighted = new Set(highlightedIds)
  for (const { source, target } of edges) {
    if (highlighted.has(source) && !highlighted.has(target)) near.add(target)
    else if (highlighted.has(target) && !highlighted.has(source)) near.add(source)
  }
  return near
}

export type NodeDim = 'none' | 'near' | 'dim'

export function nodeDim(focus: ReadonlySet<string> | null, near: ReadonlySet<string>, id: string): NodeDim {
  if (focus === null || focus.has(id)) return 'none'
  return near.has(id) ? 'near' : 'dim'
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
