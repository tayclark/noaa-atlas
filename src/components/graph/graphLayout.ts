import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import type { GraphEdge, GraphNode } from '../../data/graphSchema'

export type SimNode = GraphNode & SimulationNodeDatum
export interface SimEdge extends SimulationLinkDatum<SimNode> {
  type: GraphEdge['type']
  label: string
  sourceUrl?: string
}

/** Theme hubs render larger than service nodes since they're structural anchors, not real APIs. */
export function nodeRadius(node: GraphNode): number {
  return node.kind === 'theme' ? 14 : 8
}

// Theme edges are a loose hub-and-spoke ring around each hub, not a tight cluster — services
// only share a theme, they aren't otherwise related. Other edge types (shared-id, data-flow)
// mean the two services are directly related, so they're pulled closer together.
const LINK_DISTANCE: Record<GraphEdge['type'], number> = {
  theme: 120,
  'shared-id': 60,
  'data-flow': 60,
}
const LINK_STRENGTH: Record<GraphEdge['type'], number> = {
  theme: 0.3,
  'shared-id': 0.8,
  'data-flow': 0.8,
}

/** CSS class per edge type (#29) — a fixed 3-value enum, so className rather than inline style. */
export const EDGE_CLASS: Record<GraphEdge['type'], string> = {
  theme: 'graph-edge-theme',
  'shared-id': 'graph-edge-shared-id',
  'data-flow': 'graph-edge-data-flow',
}

/** Human-readable label per edge type, shared by the legend so its key can't drift from EDGE_CLASS. */
export const EDGE_TYPE_LABELS: Record<GraphEdge['type'], string> = {
  theme: 'Theme link',
  'shared-id': 'Shared ID',
  'data-flow': 'Data flow',
}

/**
 * Builds a configured d3-force simulation for the given nodes/edges. Does not start or stop it —
 * the caller owns the simulation's lifecycle (ticking, stopping on unmount).
 */
export function createGraphSimulation(
  nodes: SimNode[],
  edges: SimEdge[],
  width: number,
  height: number,
): Simulation<SimNode, SimEdge> {
  return forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, SimEdge>(edges)
        .id((node) => node.id)
        .distance((edge) => LINK_DISTANCE[edge.type])
        .strength((edge) => LINK_STRENGTH[edge.type]),
    )
    .force('charge', forceManyBody().strength(-150))
    .force('center', forceCenter(width / 2, height / 2))
    .force(
      'collide',
      forceCollide<SimNode>((node) => nodeRadius(node) + 4),
    )
}
