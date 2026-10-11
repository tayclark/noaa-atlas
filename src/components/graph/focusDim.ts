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

const DIM_CLASS: Record<NodeDim, string> = { none: '', near: ' graph-node-near', dim: ' graph-node-dimmed' }

/** An edge's class list: its type's class, then whether the layout hides it or the focus dims it. */
export function edgeClassName(typeClass: string, { hidden, dimmed }: { hidden: boolean; dimmed: boolean }): string {
  return `graph-edge ${typeClass}${hidden ? ' graph-hidden' : ''}${dimmed ? ' graph-edge-dimmed' : ''}`
}

/** A node's class list. Org and access hubs are `graph-org-node`, so the selectable `.graph-node` selectors skip them. */
export function nodeClassName({
  kind,
  hub,
  hidden,
  gated,
  highlighted,
  matched,
  dim,
}: {
  kind: string
  hub: boolean
  hidden: boolean
  /** A token-gated service, ringed in the access view (#60). */
  gated: boolean
  highlighted: boolean
  matched: boolean
  dim: NodeDim
}): string {
  return `${hub ? 'graph-org-node' : 'graph-node'} graph-node-${kind}${hidden ? ' graph-hidden' : ''}${gated ? ' graph-node-gated' : ''}${highlighted ? ' graph-node-highlighted' : ''}${matched ? ' graph-node-match' : ''}${DIM_CLASS[dim]}`
}
