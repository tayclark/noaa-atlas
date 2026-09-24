import { forceCenter, forceCollide, forceX, forceY, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { THEMES, type GraphEdge, type GraphNode, type Theme } from '../../data/graphSchema'

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
  theme: 55,
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

export interface FitTransform {
  x: number
  y: number
  k: number
}

/** Viewport edges (px) covered by an overlay, such as the node detail panel (#141). */
export interface Inset {
  left: number
  top: number
  right: number
  bottom: number
}

export const NO_INSET: Inset = { left: 0, top: 0, right: 0, bottom: 0 }

const FIT_SCALE_EXTENT: [number, number] = [0.25, 4]
/** Half-size (px) of the box used to frame a single highlighted node, so scale doesn't blow up. */
const SINGLE_POINT_HALF_SIZE = 40

/**
 * Computes a d3-zoom transform ({x, y, k}) that pans/zooms to frame the given node positions
 * with padding, mirroring MapLibreGlobe's fitBounds behavior for the graph's screen space (#45).
 * Pure — takes plain positions in, returns a plain transform, no d3-zoom/DOM dependency.
 * `inset` shrinks the target area to the part of the viewport not covered by an overlay.
 */
export function computeFitTransform(
  positions: readonly { x: number; y: number }[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 60,
  maxScale = 2,
  inset: Inset = NO_INSET,
): FitTransform | null {
  if (positions.length === 0) return null

  const xs = positions.map((p) => p.x)
  const ys = positions.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const bboxWidth = maxX - minX || SINGLE_POINT_HALF_SIZE * 2
  const bboxHeight = maxY - minY || SINGLE_POINT_HALF_SIZE * 2
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const areaWidth = viewportWidth - inset.left - inset.right
  const areaHeight = viewportHeight - inset.top - inset.bottom
  const availableWidth = Math.max(areaWidth - 2 * padding, 1)
  const availableHeight = Math.max(areaHeight - 2 * padding, 1)
  const k = Math.min(maxScale, FIT_SCALE_EXTENT[1], availableWidth / bboxWidth, availableHeight / bboxHeight)
  const clampedK = Math.max(FIT_SCALE_EXTENT[0], k)

  return {
    x: inset.left + areaWidth / 2 - clampedK * centerX,
    y: inset.top + areaHeight / 2 - clampedK * centerY,
    k: clampedK,
  }
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
  const anchors = themeAnchors(THEMES, width, height)
  const anchorOf = (node: SimNode) => anchors.get(node.theme) ?? { x: width / 2, y: height / 2 }
  // Seed at the theme anchor so clusters form immediately instead of untangling from d3's
  // default spiral; the small index-based offset keeps coincident nodes from stacking exactly.
  nodes.forEach((node, i) => {
    if (node.x !== undefined) return
    const { x, y } = anchorOf(node)
    const angle = i * 2.399963
    node.x = x + Math.cos(angle) * (8 + (i % 5) * 4)
    node.y = y + Math.sin(angle) * (8 + (i % 5) * 4)
  })

  const pull = (node: SimNode) => (node.kind === 'theme' ? 0.3 : 0.1)
  return forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, SimEdge>(edges)
        .id((node) => node.id)
        .distance((edge) => LINK_DISTANCE[edge.type])
        .strength((edge) => LINK_STRENGTH[edge.type]),
    )
    .force('charge', forceManyBody().strength(-110))
    .force('center', forceCenter(width / 2, height / 2))
    // Per-theme gravity: each node is pulled toward its theme's anchor, so services cluster
    // around their hub and disconnected nodes can't drift off and shrink the whole-graph fit.
    .force('x', forceX<SimNode>((node) => anchorOf(node).x).strength(pull))
    .force('y', forceY<SimNode>((node) => anchorOf(node).y).strength(pull))
    .force(
      'collide',
      forceCollide<SimNode>((node) => nodeRadius(node) + 10),
    )
}

/** One anchor per theme, evenly spaced on an ellipse sized to the canvas, in the given order. */
export function themeAnchors(themes: readonly Theme[], width: number, height: number): Map<Theme, { x: number; y: number }> {
  const rx = width * 0.36
  const ry = height * 0.36
  return new Map(
    themes.map((theme, i) => {
      const angle = (i / themes.length) * 2 * Math.PI - Math.PI / 2
      return [theme, { x: width / 2 + rx * Math.cos(angle), y: height / 2 + ry * Math.sin(angle) }]
    }),
  )
}
