// The graph's nodes as the detail views see them: services, theme hubs and the NOAA root, parsed
// and built once (#30, #78, #270).

import { graph } from '../../data/graphData'
import type { LayoutNode } from './graphLayout'

const graphNodes = graph.nodes

export type DetailNode = (typeof graphNodes)[number]

/** The graph node with this id, or undefined for none (or an id that isn't a graph node). */
export function findGraphNode(id: string | null): DetailNode | undefined {
  return id ? graphNodes.find((node) => node.id === id) : undefined
}

/** The org (#58) and access-method (#60) hubs: drawn to show structure, but never selected or focused. */
export function isHub(node: LayoutNode): boolean {
  return node.kind === 'office' || node.kind === 'program' || node.kind === 'access'
}

/** What a click or a tap can select: a service, a theme hub or the NOAA root. */
export function isSelectable(node: LayoutNode): boolean {
  return !isHub(node)
}

/** How many edges touch each node. Connectedness breaks label ties between nodes of one size (every service is the same radius). */
export function nodeDegree(edges: readonly { source: string; target: string }[]): Map<string, number> {
  const degree = new Map<string, number>()
  for (const edge of edges) for (const end of [edge.source, edge.target]) degree.set(end, (degree.get(end) ?? 0) + 1)
  return degree
}

/**
 * The on-graph label; the full name stays in the aria-label and detail panel, and in a tooltip when the
 * label is shortened (#141).
 */
export function labelText(node: LayoutNode): string {
  return node.kind === 'service' ? (node.shortName ?? node.name) : node.name
}
