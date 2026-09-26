import { forceCenter, forceCollide, forceX, forceY, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { type GraphEdge, type GraphNode, type Theme } from '../../data/graphSchema'

export type SimNode = GraphNode & SimulationNodeDatum
export interface SimEdge extends SimulationLinkDatum<SimNode> {
  type: GraphEdge['type']
  label: string
  sourceUrl?: string
}

/** The root and theme hubs render larger than service nodes: they're structural anchors, not real APIs. */
export function nodeRadius(node: GraphNode): number {
  if (node.kind === 'root') return 20
  return node.kind === 'theme' ? 14 : 8
}

// Theme edges are a loose hub-and-spoke ring around each hub, not a tight cluster — services
// only share a theme, they aren't otherwise related. Other edge types (shared-id, data-flow)
// mean the two services are directly related, so they're pulled closer together.
// Root edges are weak: the theme anchors, not the links, place the hubs on their ring (#148).
const LINK_DISTANCE: Record<GraphEdge['type'], number> = {
  root: 150,
  theme: 55,
  'shared-id': 60,
  'data-flow': 60,
}
const LINK_STRENGTH: Record<GraphEdge['type'], number> = {
  root: 0.02,
  theme: 0.3,
  'shared-id': 0.8,
  'data-flow': 0.8,
}

// Order of the theme anchors around the ring: THEMES order, except that space weather sits
// between the two smallest themes (hazards, fisheries) instead of between satellite and models,
// the two largest, so its labels have room (#18).
export const RING_ORDER: readonly Theme[] = [
  'weather',
  'climate',
  'ocean',
  'satellite',
  'models',
  'hazards',
  'space-weather',
  'fisheries',
  'geospatial',
  'catalogs',
]

/** CSS class per edge type (#29) — a fixed 3-value enum, so className rather than inline style. */
export const EDGE_CLASS: Record<GraphEdge['type'], string> = {
  root: 'graph-edge-root',
  theme: 'graph-edge-theme',
  'shared-id': 'graph-edge-shared-id',
  'data-flow': 'graph-edge-data-flow',
}

/** Human-readable label per edge type, shared by the legend so its key can't drift from EDGE_CLASS. */
export const EDGE_TYPE_LABELS: Record<GraphEdge['type'], string> = {
  root: 'NOAA → theme',
  theme: 'Theme → service',
  'shared-id': 'Shared identifiers',
  'data-flow': 'Data flows into',
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

/** A node to frame: its layout position and radius, and the on-screen width of its label. */
export interface LabelledPosition {
  x: number
  y: number
  radius: number
  labelWidth: number
}

/**
 * computeFitTransform, but with room for each node's label on its right, the first side label
 * placement tries. Framing node centres alone could leave a neighbour's label past the canvas edge
 * (#18). Labels keep a constant screen size, so their extent in layout units depends on the scale:
 * fit the nodes, then refit with each label's end at that scale.
 */
export function computeLabelledFitTransform(
  items: readonly LabelledPosition[],
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
  maxScale: number,
  inset: Inset,
  labelGap: number,
): FitTransform | null {
  const nodesOnly = computeFitTransform(items, viewportWidth, viewportHeight, padding, maxScale, inset)
  if (!nodesOnly) return null
  const labelEnds = items.map(({ x, y, radius, labelWidth }) => ({ x: x + radius + (labelGap + labelWidth) / nodesOnly.k, y }))
  return computeFitTransform([...items, ...labelEnds], viewportWidth, viewportHeight, padding, maxScale, inset)
}

/**
 * The largest group of positions that chain together within `linkDistance` of each other (single
 * linkage). Ties go to the group holding the earliest item, so a task's primary node wins.
 */
export function largestLinkedGroup<T extends { x: number; y: number }>(items: readonly T[], linkDistance: number): T[] {
  const groupOf = items.map(() => -1)
  const groups: number[][] = []
  items.forEach((_, start) => {
    if (groupOf[start] !== -1) return
    const members = [start]
    groupOf[start] = groups.length
    for (let i = 0; i < members.length; i++) {
      const a = items[members[i] as number] as T
      items.forEach((b, j) => {
        if (groupOf[j] === -1 && Math.hypot(a.x - b.x, a.y - b.y) <= linkDistance) {
          groupOf[j] = groups.length
          members.push(j)
        }
      })
    }
    groups.push(members)
  })
  const largest = groups.reduce((best, group) => (group.length > best.length ? group : best), [] as number[])
  return largest.sort((a, b) => a - b).map((i) => items[i] as T)
}

/**
 * Frames a task's path (#162). A path whose nodes sit far apart would only fit below
 * `minScale`, where the labels of a tight group of steps collide. Then the largest group of
 * steps is framed at a readable scale instead; the outlying steps' connectors still lead off-screen
 * towards them. A path with no group of two or more steps keeps the whole-path fit.
 */
export function computePathFitTransform(
  items: readonly LabelledPosition[],
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
  maxScale: number,
  inset: Inset,
  labelGap: number,
  minScale: number,
  linkDistance: number,
): FitTransform | null {
  const whole = computeLabelledFitTransform(items, viewportWidth, viewportHeight, padding, maxScale, inset, labelGap)
  if (!whole || whole.k >= minScale) return whole
  const group = largestLinkedGroup(items, linkDistance)
  if (group.length < 2 || group.length === items.length) return whole
  return computeLabelledFitTransform(group, viewportWidth, viewportHeight, padding, maxScale, inset, labelGap)
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
  const anchors = themeAnchors(RING_ORDER, width, height)
  const center = { x: width / 2, y: height / 2 }
  // The root sits at the centre of the ring of theme anchors.
  const anchorOf = (node: SimNode) => (node.kind === 'root' ? center : (anchors.get(node.theme) ?? center))
  // Seed at the theme anchor so clusters form immediately instead of untangling from d3's
  // default spiral; the small index-based offset keeps coincident nodes from stacking exactly.
  nodes.forEach((node, i) => {
    if (node.x !== undefined) return
    const { x, y } = anchorOf(node)
    const angle = i * 2.399963
    node.x = x + Math.cos(angle) * (8 + (i % 5) * 4)
    node.y = y + Math.sin(angle) * (8 + (i % 5) * 4)
  })

  const pull = (node: SimNode) => (node.kind === 'root' ? 1 : node.kind === 'theme' ? 0.3 : 0.1)
  return forceSimulation(nodes)
    .force(
      'link',
      forceLink<SimNode, SimEdge>(edges)
        .id((node) => node.id)
        .distance((edge) => LINK_DISTANCE[edge.type])
        .strength((edge) => LINK_STRENGTH[edge.type]),
    )
    .force('charge', forceManyBody<SimNode>().strength((node) => (node.kind === 'root' ? -20 : -110)))
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
  const rx = width * 0.4
  const ry = height * 0.4
  return new Map(
    themes.map((theme, i) => {
      const angle = (i / themes.length) * 2 * Math.PI - Math.PI / 2
      return [theme, { x: width / 2 + rx * Math.cos(angle), y: height / 2 + ry * Math.sin(angle) }]
    }),
  )
}
