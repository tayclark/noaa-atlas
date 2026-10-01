import { forceCenter, type ForceLink, forceCollide, forceX, forceY, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { programNodeId } from '../../data/orgHierarchy'
import type { Box } from './labelPlacement'
import { ROOT_NODE_ID, type GraphEdge, type GraphNode, type OrgNode, type Theme } from '../../data/graphSchema'

/** Everything the view draws: the graph's nodes plus the render-only org hubs (#58). */
export type LayoutNode = GraphNode | OrgNode
export type SimNode = LayoutNode & SimulationNodeDatum

/** Theme: services cluster around theme hubs. Org: a NOAA → office → program → service tree (#58). */
export type LayoutMode = 'theme' | 'org'

/** Each mode hides the other's hubs; the root and services appear in both. */
export function isNodeVisible(node: LayoutNode, mode: LayoutMode): boolean {
  if (node.kind === 'theme') return mode === 'theme'
  if (node.kind === 'office' || node.kind === 'program') return mode === 'org'
  return true
}

export function isEdgeVisible(edge: Pick<GraphEdge, 'type'>, mode: LayoutMode): boolean {
  if (edge.type === 'root' || edge.type === 'theme') return mode === 'theme'
  if (edge.type === 'org') return mode === 'org'
  return true
}
export interface SimEdge extends SimulationLinkDatum<SimNode> {
  type: GraphEdge['type']
  label: string
  sourceUrl?: string
}

/** The root and theme hubs render larger than service nodes: they're structural anchors, not real APIs. */
export function nodeRadius(node: LayoutNode): number {
  if (node.kind === 'root') return 20
  if (node.kind === 'theme' || node.kind === 'office') return 14
  return node.kind === 'program' ? 10 : 8
}

// Theme edges are a loose hub-and-spoke ring around each hub, not a tight cluster — services
// only share a theme, they aren't otherwise related. Other edge types (shared-id, data-flow)
// mean the two services are directly related, so they're pulled closer together.
// Root edges are weak: the theme anchors, not the links, place the hubs on their ring (#148).
const LINK_DISTANCE: Record<GraphEdge['type'], number> = {
  root: 150,
  theme: 55,
  org: 40,
  'shared-id': 60,
  'data-flow': 60,
}
const LINK_STRENGTH: Record<GraphEdge['type'], number> = {
  root: 0.02,
  theme: 0.3,
  org: 0.5,
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
  org: 'graph-edge-org',
  'shared-id': 'graph-edge-shared-id',
  'data-flow': 'graph-edge-data-flow',
}

/** Human-readable label per edge type, shared by the legend so its key can't drift from EDGE_CLASS. */
export const EDGE_TYPE_LABELS: Record<GraphEdge['type'], string> = {
  root: 'NOAA → theme',
  theme: 'Theme → service',
  org: 'Office, program → service',
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

/** Clearance between an overlay and the area a selection is framed into. */
export const PANEL_GAP = 8

/** A node's centre and radius, in layout units, for hit testing. */
export interface HitNode {
  id: string
  x: number
  y: number
  radius: number
}

/**
 * The node a touch at `point` (screen px, from the graph's top-left corner) means (#78): the one
 * whose dot is nearest, counting only dots within `slop` px of the touch. A fingertip covers about
 * 40px, but a dot is only a few px across at the default zoom and its neighbours are closer than
 * that, so a touch has to resolve to the nearest dot rather than the one it lands on. Dots sit
 * under the zoom `transform`, so a node is `k * radius` px across on screen.
 */
export function nearestNodeWithin(
  nodes: readonly HitNode[],
  point: { x: number; y: number },
  transform: FitTransform,
  slop: number,
): string | null {
  let best: { id: string; gap: number; distance: number } | null = null
  for (const node of nodes) {
    const distance = Math.hypot(transform.x + transform.k * node.x - point.x, transform.y + transform.k * node.y - point.y)
    const gap = distance - transform.k * node.radius
    if (gap > slop) continue
    if (!best || gap < best.gap || (gap === best.gap && distance < best.distance)) best = { id: node.id, gap, distance }
  }
  return best?.id ?? null
}

// A quarter of the free area, never less than this: room to keep a selection off the edges.
const FRAMING_PADDING_SHARE = 0.25
const FRAMING_PADDING_MIN = 16

/**
 * The padding (px) kept clear around a framed selection: `max` on a roomy canvas, and a share of
 * the free area on a short one, where a fixed 60px each side left almost nothing to fit into and
 * pinned the scale to its minimum (#78).
 */
export function framingPadding(areaWidth: number, areaHeight: number, max: number): number {
  return Math.max(Math.min(max, Math.min(areaWidth, areaHeight) * FRAMING_PADDING_SHARE), FRAMING_PADDING_MIN)
}

/**
 * The part of a `width` x `height` viewport an overlay (`panel`, in the viewport's own pixels)
 * leaves free, as the inset to frame into (#141): the largest of the strips right of, below, left
 * of and above it, so a card in the top-left corner and a sheet along the bottom both work (#78).
 * An overlay that leaves no room frames as though it were not there.
 */
export function panelInset(panel: Box | null, width: number, height: number, gap = PANEL_GAP): Inset {
  if (!panel) return NO_INSET
  const strips: { inset: Inset; area: number }[] = [
    { inset: { ...NO_INSET, left: panel.x1 + gap }, area: (width - panel.x1 - gap) * height },
    { inset: { ...NO_INSET, top: panel.y1 + gap }, area: width * (height - panel.y1 - gap) },
    { inset: { ...NO_INSET, right: width - panel.x0 + gap }, area: (panel.x0 - gap) * height },
    { inset: { ...NO_INSET, bottom: height - panel.y0 + gap }, area: width * (panel.y0 - gap) },
  ]
  // The first of equal strips wins, which keeps the right-hand strip ahead of the one below.
  const best = strips.reduce((a, b) => (b.area > a.area ? b : a))
  return best.area > 0 ? best.inset : NO_INSET
}

const FIT_SCALE_EXTENT: [number, number] = [0.25, 4]

const KEY_PAN_STEP = 60
const KEY_ZOOM_FACTOR = 1.25

/**
 * The transform after a keyboard pan/zoom key (#86), or null for any other key. Arrows move the
 * view by a fixed screen distance; +/- scale about the viewport centre, clamped to the zoom extent.
 */
export function keyboardViewTransform(
  current: FitTransform,
  key: string,
  viewportWidth: number,
  viewportHeight: number,
): FitTransform | null {
  switch (key) {
    case 'ArrowLeft':
      return { ...current, x: current.x + KEY_PAN_STEP }
    case 'ArrowRight':
      return { ...current, x: current.x - KEY_PAN_STEP }
    case 'ArrowUp':
      return { ...current, y: current.y + KEY_PAN_STEP }
    case 'ArrowDown':
      return { ...current, y: current.y - KEY_PAN_STEP }
    case '+':
    case '=':
    case '-':
    case '_': {
      const factor = key === '+' || key === '=' ? KEY_ZOOM_FACTOR : 1 / KEY_ZOOM_FACTOR
      const k = Math.min(FIT_SCALE_EXTENT[1], Math.max(FIT_SCALE_EXTENT[0], current.k * factor))
      const ratio = k / current.k
      const cx = viewportWidth / 2
      const cy = viewportHeight / 2
      return { x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio, k }
    }
    default:
      return null
  }
}
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

const ORG_COLUMN_GAP = 200
// Leaves zig-zag between two columns, so neighbouring labels sit side by side and the tall tree
// stays closer to the canvas's wide aspect, which keeps it from being scaled down to fit.
const ORG_ROW_GAP = 13
const ORG_ZIGZAG = 170
const ORG_OFFICE_GAP = 16

/**
 * Target position of every node in the org tree (#58), laid out left to right: the root, then
 * offices, programs and services in columns. Leaves are stacked top to bottom, one office after
 * another, and each parent sits at the mean height of its children. Centred on the canvas.
 * Theme hubs have no place in the tree, so they sit with the root.
 */
export function orgTargets(nodes: readonly LayoutNode[], width: number, height: number): Map<string, { x: number; y: number }> {
  const services = nodes.flatMap((node) => (node.kind === 'service' ? [node] : []))
  const programIds = new Set(nodes.flatMap((node) => (node.kind === 'program' ? [node.id] : [])))
  const offices = nodes.flatMap((node) => (node.kind === 'office' ? [node] : []))
  const raw = new Map<string, { x: number; y: number }>()
  let cursor = 0
  let leaves = 0
  const leaf = (id: string, column: number) => {
    raw.set(id, { x: column * ORG_COLUMN_GAP + (leaves++ % 2) * ORG_ZIGZAG, y: cursor })
    cursor += ORG_ROW_GAP
    return cursor - ORG_ROW_GAP
  }
  const mean = (ys: number[]) => ys.reduce((sum, y) => sum + y, 0) / ys.length
  const officeYs: number[] = []
  for (const office of offices) {
    const own = services.filter((service) => service.owner.office === office.office)
    const unitYs: number[] = []
    for (const program of nodes.filter((node) => node.kind === 'program' && node.office === office.office)) {
      const members = own.filter((service) => programNodeId(service) === program.id)
      const y = mean(members.map((service) => leaf(service.id, 3)))
      raw.set(program.id, { x: 2 * ORG_COLUMN_GAP, y })
      unitYs.push(y)
    }
    for (const service of own.filter((service) => !programIds.has(programNodeId(service)))) unitYs.push(leaf(service.id, 3))
    const y = mean(unitYs.length > 0 ? unitYs : [cursor])
    raw.set(office.id, { x: ORG_COLUMN_GAP, y })
    officeYs.push(y)
    cursor += ORG_OFFICE_GAP
  }
  const rootY = officeYs.length > 0 ? mean(officeYs) : 0
  raw.set(ROOT_NODE_ID, { x: 0, y: rootY })
  const ys = [...raw.values()].map((p) => p.y)
  const dx = width / 2 - (3 * ORG_COLUMN_GAP + ORG_ZIGZAG) / 2
  const dy = height / 2 - (Math.min(...ys) + Math.max(...ys)) / 2
  const targets = new Map([...raw].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]))
  for (const node of nodes) if (!targets.has(node.id)) targets.set(node.id, targets.get(ROOT_NODE_ID) ?? { x: width / 2, y: height / 2 })
  return targets
}

/**
 * Points the simulation's forces at a layout mode (#58). Every node and edge stays in the
 * simulation so the view's element indexes never change: what the mode hides simply exerts no
 * force (zero link strength, charge, collision and gravity). The org tree is fixed positions, so
 * its nodes are pulled straight to their targets and exert no forces on each other.
 */
export function applyLayoutMode(
  simulation: Simulation<SimNode, SimEdge>,
  nodes: readonly SimNode[],
  mode: LayoutMode,
  width: number,
  height: number,
): void {
  const anchors = themeAnchors(RING_ORDER, width, height)
  const center = { x: width / 2, y: height / 2 }
  const targets = mode === 'org' ? orgTargets(nodes, width, height) : new Map<string, { x: number; y: number }>()
  // The root sits at the centre of the ring of theme anchors.
  const anchorOf = (node: SimNode) =>
    mode === 'org'
      ? (targets.get(node.id) ?? center)
      : node.kind === 'root'
        ? center
        : node.kind === 'office' || node.kind === 'program'
          ? center
          : (anchors.get(node.theme) ?? center)
  const visible = (node: SimNode) => isNodeVisible(node, mode)
  const pull = (node: SimNode) => {
    if (!visible(node)) return 0
    if (mode === 'org') return 1
    return node.kind === 'root' ? 1 : node.kind === 'theme' ? 0.3 : 0.1
  }
  simulation
    .force<ForceLink<SimNode, SimEdge>>('link')
    ?.distance((edge) => LINK_DISTANCE[edge.type])
    .strength((edge) => (mode === 'theme' && isEdgeVisible(edge, mode) ? LINK_STRENGTH[edge.type] : 0))
  simulation
    .force('charge', forceManyBody<SimNode>().strength((node) => (!visible(node) || mode === 'org' ? 0 : node.kind === 'root' ? -20 : -110)))
    // Per-theme gravity: each node is pulled toward its theme's anchor, so services cluster
    // around their hub and disconnected nodes can't drift off and shrink the whole-graph fit.
    .force('x', forceX<SimNode>((node) => anchorOf(node).x).strength(pull))
    .force('y', forceY<SimNode>((node) => anchorOf(node).y).strength(pull))
    .force('collide', forceCollide<SimNode>((node) => (visible(node) && mode === 'theme' ? nodeRadius(node) + 10 : 0)))
    .force('center', mode === 'org' ? null : forceCenter(width / 2, height / 2))
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
  mode: LayoutMode = 'theme',
): Simulation<SimNode, SimEdge> {
  const anchors = themeAnchors(RING_ORDER, width, height)
  const center = { x: width / 2, y: height / 2 }
  // Seed at the theme anchor so clusters form immediately instead of untangling from d3's
  // default spiral; the small index-based offset keeps coincident nodes from stacking exactly.
  nodes.forEach((node, i) => {
    if (node.x !== undefined) return
    const { x, y } = node.kind === 'theme' ? (anchors.get(node.theme) ?? center) : node.kind === 'service' ? (anchors.get(node.theme) ?? center) : center
    const angle = i * 2.399963
    node.x = x + Math.cos(angle) * (8 + (i % 5) * 4)
    node.y = y + Math.sin(angle) * (8 + (i % 5) * 4)
  })
  const simulation = forceSimulation(nodes).force('link', forceLink<SimNode, SimEdge>(edges).id((node) => node.id))
  applyLayoutMode(simulation, nodes, mode, width, height)
  return simulation
}

/**
 * Runs a simulation to rest synchronously and stops it, for users who prefer reduced motion (#47):
 * the layout is final on the first paint instead of visibly spreading out. Returns the tick count.
 */
export function settleSimulation(simulation: Simulation<SimNode, SimEdge>, maxTicks = 600): number {
  simulation.stop()
  let ticks = 0
  while (simulation.alpha() >= simulation.alphaMin() && ticks < maxTicks) {
    simulation.tick()
    ticks++
  }
  return ticks
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
