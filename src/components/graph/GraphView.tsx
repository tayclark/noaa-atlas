// Force-directed graph view (#28). Renders the curated NOAA API graph (buildGraph() over
// graph.json) with d3-force layout and d3-zoom/d3-drag interaction.
//
// Renderer decision: SVG, not canvas. At this scale (~15 nodes / handful of edges) canvas's
// only advantage — avoiding per-element DOM cost — doesn't apply, while SVG elements stay real,
// accessible, testable DOM nodes (matching this repo's jsdom + Testing Library conventions,
// unlike opaque canvas pixels). D3 owns node/edge positions and pan/zoom/drag behavior; React
// renders the structure once and D3 writes position attributes imperatively via refs on each
// simulation tick, so a settling simulation (which can tick 100+ times) doesn't trigger a React
// re-render per frame — the same "imperative escape hatch inside useEffect" pattern
// MapLibreGlobe.tsx uses for its own rendering library.

import { drag as d3drag } from 'd3-drag'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import './GraphView.css'
import graphJson from '../../data/graph.json'
import tasksJson from '../../data/tasks.json'
import { buildGraph } from '../../data/buildGraph'
import { buildAccessHierarchy } from '../../data/accessHierarchy'
import { buildOrgHierarchy } from '../../data/orgHierarchy'
import { parseGraphFile, THEME_LABELS } from '../../data/graphSchema'
import { getNeighbors } from '../../data/neighbors'
import { parseTasksFile } from '../../data/taskSchema'
import {
  clearSelection,
  getHighlightedNodeIds,
  getSelectedTaskPath,
  getSelectionSnapshot,
  selectNode,
  subscribeSelection,
} from '../../data/selectionStore'
import { getSheetBox, subscribeSheetBox, type SheetBox } from '../../data/sheetStore'
import { nodeColor } from '../../data/themeColors'
import { prefersReducedMotion } from '../prefersReducedMotion'
import { focusIds, isEdgeDimmed, neighborIds, nodeDim } from './focusDim'
import {
  computeFitTransform,
  computeLabelledFitTransform,
  computePathFitTransform,
  createGraphSimulation,
  applyLayoutMode,
  isEdgeVisible,
  isNodeVisible,
  keyboardViewTransform,
  settleSimulation,
  EDGE_CLASS,
  framingPadding,
  nearestNodeWithin,
  nodeRadius,
  panelInset,
  type FitTransform,
  type HitNode,
  type Inset,
  type LayoutMode,
  type LayoutNode,
  type SimEdge,
  type SimNode,
} from './graphLayout'
import { selectionAnnouncement } from './a11yAnnouncements'
import { GraphLegend } from './GraphLegend'
import { GraphSearch, type SearchResult } from './GraphSearch'
import { buildSearchIndex, matchNodeIds } from './searchMatch'
import { boxRelativeTo, DIAGONAL_OFFSET, LABEL_GAP, labelBudget, placeLabels, type Box, type LabelItem } from './labelPlacement'
import { NodeDetailPanel } from './NodeDetailPanel'
import { revealTransform, rovingOrder, rovingTabStop, rovingTarget } from './rovingFocus'
import { useNarrowLayout } from '../useNarrowLayout'

const graphFile = parseGraphFile(graphJson)
const graph = buildGraph(graphFile)
const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]))
// The org (#58) and access-method (#60) hubs are only drawn: search, neighbours and the detail panel keep reading `graph`.
const orgHierarchy = buildOrgHierarchy(graphFile)
const accessHierarchy = buildAccessHierarchy(graphFile)
const drawnNodes: LayoutNode[] = [...graph.nodes, ...orgHierarchy.nodes, ...accessHierarchy.nodes]
const dimClass = { none: '', near: ' graph-node-near', dim: ' graph-node-dimmed' } as const
const drawnEdges = [...graph.edges, ...orgHierarchy.edges, ...accessHierarchy.edges]
// `short` is the visible text on a phone, where the toolbar is one row; the accessible name stays `label`.
const LAYOUT_MODES: { mode: LayoutMode; label: string; short: string; title: string }[] = [
  { mode: 'theme', label: 'Theme view', short: 'Theme', title: 'Group services by theme' },
  { mode: 'org', label: 'Org view', short: 'Org', title: 'Group services by the NOAA office and program that runs them' },
  { mode: 'access', label: 'Access view', short: 'Access', title: 'Group services by how the data is reached: REST, OGC, ArcGIS, cloud bucket or file download' },
]
// Connectedness breaks label ties between nodes of one size (every service is the same radius).
const nodeDegree = new Map<string, number>()
for (const edge of drawnEdges) for (const end of [edge.source, edge.target]) nodeDegree.set(end, (nodeDegree.get(end) ?? 0) + 1)
const drawnNodeById = new Map(drawnNodes.map((node) => [node.id, node]))
// A selected node is framed together with its neighbors, at a scale capped so labels stay legible.
const SELECTION_MAX_SCALE = 1.25
// Below this a task's path is too spread out to read, so its largest group of steps (nodes within
// PATH_LINK_DISTANCE layout units of each other) is framed instead (#162).
const PATH_MIN_SCALE = 0.8
const PATH_LINK_DISTANCE = 150
const FIT_ALL_PADDING = 40
// Labels render at this size on screen at every zoom level (#138); overlaps are hidden instead.
const LABEL_PX = 12
const LABEL_HEIGHT = 13
const AUTOFIT_TICK_INTERVAL = 20
// A touch is a tap, rather than the start of a pan or a pinch, when it ends this close (px) and this
// soon (ms) to where it began; it means the nearest dot within TAP_REACH_PX of its edge (#78).
const TAP_SLOP_PX = 10
const TAP_MAX_MS = 500
const TAP_REACH_PX = 22
// The click a browser may send after a tap we already handled arrives this soon (ms) after it.
const TAP_ECHO_MS = 700
const ZOOM_MS = 250
// How far inside the canvas edge (px) a node the arrow keys move to is kept (#284).
const REVEAL_MARGIN = 40

const tasks = parseTasksFile(tasksJson).tasks
const searchIndex = buildSearchIndex(graph.nodes, tasks)
const nodeNameById = new Map(graph.nodes.map((node) => [node.id, node.name]))
const taskLabelById = new Map(tasks.map((task) => [task.id, task.label]))

// The on-graph label; the full name stays in the tooltip, aria-label and detail panel (#141).
const labelText = (node: LayoutNode) => (node.kind === 'service' ? (node.shortName ?? node.name) : node.name)

// Positions the synthetic task-path connectors (#34) from the live node positions. The lines are
// React-rendered (they come and go with the selection) but positioned imperatively, like every
// other element here, so simulation ticks don't trigger re-renders.
function positionPathEdges(root: Element | null, positions: Map<string, { x: number; y: number }>) {
  root?.querySelectorAll<SVGLineElement>('.graph-path-edge').forEach((el) => {
    const source = positions.get(el.dataset.source ?? '')
    const target = positions.get(el.dataset.target ?? '')
    if (!source || !target) return
    el.setAttribute('x1', String(source.x))
    el.setAttribute('y1', String(source.y))
    el.setAttribute('x2', String(target.x))
    el.setAttribute('y2', String(target.y))
  })
}

/**
 * What covers part of the canvas, in the SVG's screen space, or null when nothing does: the node
 * detail card on a wide screen, or the sheet on a phone (#78), along the bottom or down the right,
 * whose place comes from sheetStore because the sheet is a sibling of the whole view, not of the
 * canvas.
 */
function detailPanelBox(svgEl: SVGSVGElement, sheet: SheetBox | null): Box | null {
  if (sheet) {
    const { clientWidth: width, clientHeight: height } = svgEl
    if (width <= 0 || height <= 0) return null
    return sheet.edge === 'right'
      ? { x0: Math.max(0, width - sheet.size), y0: 0, x1: width, y1: height }
      : { x0: 0, y0: Math.max(0, height - sheet.size), x1: width, y1: height }
  }
  const panelRect = svgEl.parentElement?.querySelector('.node-detail-panel')?.getBoundingClientRect()
  return panelRect ? boxRelativeTo(panelRect, svgEl.getBoundingClientRect()) : null
}

/** The phone zoom buttons (#78) float over the canvas's top-right corner, so no label may sit under them (#292). */
function zoomControlsBox(svgEl: SVGSVGElement): Box | null {
  const rect = svgEl.parentElement?.querySelector('.graph-zoom-controls')?.getBoundingClientRect()
  return rect ? boxRelativeTo(rect, svgEl.getBoundingClientRect()) : null
}

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null) // the canvas below the toolbar, so the toolbar isn't counted in `size`
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomLayerRef = useRef<SVGGElement>(null)
  const nodeElsRef = useRef(new Map<string, SVGGElement>())
  const edgeElsRef = useRef<SVGLineElement[]>([])
  const nodePositionsRef = useRef(new Map<string, { x: number; y: number }>())
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  // Re-runs the current highlight/pan logic on demand (e.g. once the simulation settles),
  // independent of the [selection, size]-keyed effect below (#45).
  const applyHighlightPanRef = useRef<(settled?: boolean) => void>(() => {})
  const highlightKeyRef = useRef('')
  const fitAllRef = useRef<() => void>(() => {})
  const placeLabelsRef = useRef<() => void>(() => {})
  const labelWidthsRef = useRef(new Map<string, number>())
  // Read by placeLabelsRef, which runs outside React renders (zoom, ticks), so it's a ref.
  const labelPriorityRef = useRef(new Map<string, number>())
  // The first settled layout is auto-fit once; later settles (e.g. after a node drag) must not
  // yank the view away from where the user left it.
  const initialFitDoneRef = useRef(false)
  // Set when the user pans or zooms, and cleared when a selection is framed: a layout that settles
  // later must not pull the view back from where they put it (#78).
  const userMovedRef = useRef(false)
  const tapHandledAtRef = useRef(-Infinity)
  // Read by the fit and label code, which run outside React renders; `relayoutRef` is assigned by
  // the simulation effect, which owns the simulation (#58).
  const modeRef = useRef<LayoutMode>('theme')
  const relayoutRef = useRef<(mode: LayoutMode) => void>(() => {})
  const [size, setSize] = useState({ width: 600, height: 400 })
  const initialSizeRef = useRef(size)
  const [legendOpen, setLegendOpen] = useState(false)
  const [mode, setMode] = useState<LayoutMode>('theme')
  // The nodes share one Tab stop, and the arrow keys move between them (#284).
  const focusOrder = useMemo(() => rovingOrder(drawnNodes, mode), [mode])
  const [lastFocusedId, setLastFocusedId] = useState<string | null>(null)
  // Kept across selections, so a user who collapses the panel isn't fighting it on every click.
  // A phone has no floating card: its detail is a bottom sheet, which publishes its height (#78).
  const narrow = useNarrowLayout()
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const sheet = useSyncExternalStore(subscribeSheetBox, getSheetBox)
  // Read by placeLabelsRef, which runs outside React renders (zoom, ticks), so it's a ref. It is
  // kept up to date by the first effect below, which runs ahead of the ones that place labels.
  const sheetRef = useRef(sheet)
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const highlightedIds = getHighlightedNodeIds()
  const highlightKey = highlightedIds.join('|')
  const taskPath = getSelectedTaskPath()
  const pathPairs = taskPath.slice(1).map((target, i) => ({ source: taskPath[i] as string, target }))
  const announcement = selectionAnnouncement(selection, nodeNameById, taskLabelById, highlightedIds.length)
  const [query, setQuery] = useState('')
  const matchedIds = useMemo(() => matchNodeIds(searchIndex, query), [query])
  const focus = focusIds(matchedIds, highlightedIds)
  const near = neighborIds(drawnEdges, highlightedIds, matchedIds)
  // What a phone lists under the search box: the matches by name, with where each sits (#78).
  // Services come first, since an API is what the reader is after; the theme hubs follow.
  const searchResults = useMemo<SearchResult[]>(() => {
    const found = [...(matchedIds ?? [])].flatMap((id) => {
      const node = graphNodeById.get(id)
      return node ? [node] : []
    })
    return [...found.filter((node) => node.kind === 'service'), ...found.filter((node) => node.kind !== 'service')].map((node) => ({
      id: node.id,
      name: node.name,
      detail: node.kind === 'service' ? THEME_LABELS[node.theme] : node.kind === 'theme' ? 'Theme' : 'NOAA',
    }))
  }, [matchedIds])

  useEffect(() => {
    sheetRef.current = sheet
  }, [sheet])

  // Taps by touch or pen (#78). Dots are too small and too close for a finger to land on, and the
  // browser's own click after a tap is withheld when the finger drifts a pixel, so a tap is read
  // here: a single pointer that goes down and up within TAP_SLOP_PX and TAP_MAX_MS selects the
  // nearest dot within reach, and a tap on nothing clears the selection. The mouse keeps its click.
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return
    let tap: { id: number; x: number; y: number; t: number } | null = null
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return
      // A second finger is a pinch, not a tap.
      tap = event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp } : null
    }
    const onMove = (event: PointerEvent) => {
      if (tap && event.pointerId === tap.id && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP_PX) tap = null
    }
    const onUp = (event: PointerEvent) => {
      const start = tap
      tap = null
      if (!start || event.pointerId !== start.id || event.timeStamp - start.t > TAP_MAX_MS) return
      tapHandledAtRef.current = event.timeStamp
      const rect = svgEl.getBoundingClientRect()
      const hittable: HitNode[] = []
      nodePositionsRef.current.forEach((position, id) => {
        const node = drawnNodeById.get(id)
        if (node && (node.kind === 'service' || node.kind === 'theme' || node.kind === 'root') && isNodeVisible(node, modeRef.current)) {
          hittable.push({ id, ...position, radius: nodeRadius(node) })
        }
      })
      const hit = nearestNodeWithin(hittable, { x: event.clientX - rect.left, y: event.clientY - rect.top }, zoomTransform(svgEl), TAP_REACH_PX)
      setLegendOpen(false)
      if (hit) selectNode(hit)
      else {
        const { selectedNodeId, selectedPoint, selectedTaskId } = getSelectionSnapshot()
        if (selectedNodeId || selectedPoint || selectedTaskId) clearSelection()
      }
    }
    const cancel = () => {
      tap = null
    }
    svgEl.addEventListener('pointerdown', onDown)
    svgEl.addEventListener('pointermove', onMove)
    svgEl.addEventListener('pointerup', onUp)
    svgEl.addEventListener('pointercancel', cancel)
    return () => {
      svgEl.removeEventListener('pointerdown', onDown)
      svgEl.removeEventListener('pointermove', onMove)
      svgEl.removeEventListener('pointerup', onUp)
      svgEl.removeEventListener('pointercancel', cancel)
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    // jsdom (this repo's test environment) has no ResizeObserver; the graph still renders and
    // is interactive at the initial `size` default, just without live resize tracking.
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ width, height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!svgRef.current || !zoomLayerRef.current) return

    const simNodes: SimNode[] = drawnNodes.map((node) => ({ ...node }))
    const simEdges: SimEdge[] = drawnEdges.map((edge) => ({ ...edge }))
    // Lay out for the canvas as it is now, not the 600x400 default, so the theme ring matches its
    // aspect and the fit-all scale isn't squeezed by a mismatched layout (#176).
    const container = containerRef.current
    const layoutWidth = container?.clientWidth || initialSizeRef.current.width
    const layoutHeight = container?.clientHeight || initialSizeRef.current.height
    const simulation = createGraphSimulation(simNodes, simEdges, layoutWidth, layoutHeight)

    const svg = select(svgRef.current)
    const zoomLayer = select(zoomLayerRef.current)

    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      // The double-tap zoom eases over this long; with reduced motion it jumps.
      .duration(prefersReducedMotion() ? 0 : ZOOM_MS)
      .on('zoom', (event: { transform: ZoomTransform; sourceEvent: unknown }) => {
        zoomLayer.attr('transform', event.transform.toString())
        zoomLayer.style('--graph-label-px', String(LABEL_PX / event.transform.k))
        scheduleLabelPlacement()
        // Pan/zoom by the user (not our programmatic fit) ends the automatic framing.
        if (event.sourceEvent) {
          initialFitDoneRef.current = true
          userMovedRef.current = true
        }
      })
    svg.call(zoomBehavior)
    zoomBehaviorRef.current = zoomBehavior

    const nodeById = new Map(simNodes.map((node) => [node.id, node]))

    // Measured at the label's size on screen. The font is LABEL_PX / k in world units, so a measure
    // taken after a zoom (a re-run of this effect, as StrictMode does) is rescaled by k.
    const measureScale = zoomTransform(svgRef.current).k
    nodeElsRef.current.forEach((el, id) => {
      const text = el.querySelector('text')
      const measured = (text?.getComputedTextLength?.() ?? 0) * measureScale
      const node = nodeById.get(id)
      labelWidthsRef.current.set(id, measured > 0 ? measured : (node ? labelText(node).length : 0) * 6.5)
    })

    const svgEl = svgRef.current
    placeLabelsRef.current = () => {
      const t = zoomTransform(svgEl)
      const items: LabelItem[] = []
      nodeElsRef.current.forEach((_, id) => {
        const pos = nodePositionsRef.current.get(id)
        const node = nodeById.get(id)
        if (!pos || !node || !isNodeVisible(node, modeRef.current)) return
        const priority = labelPriorityRef.current.get(id) ?? (node.kind === 'service' ? 0 : 3)
        items.push({
          id,
          x: t.applyX(pos.x),
          y: t.applyY(pos.y),
          radius: nodeRadius(node) * t.k,
          width: labelWidthsRef.current.get(id) ?? 0,
          height: LABEL_HEIGHT,
          priority,
          rank: nodeRadius(node) * 100 + (nodeDegree.get(id) ?? 0),
          // Hubs, matches and the selection may cover other nodes' dots (never another label).
          overNodes: priority >= 3,
        })
      })
      const obstacles = [detailPanelBox(svgEl, sheetRef.current), zoomControlsBox(svgEl)].filter((box) => box !== null)
      const bounds = { width: svgEl.clientWidth || initialSizeRef.current.width, height: svgEl.clientHeight || initialSizeRef.current.height }
      const sides = placeLabels(items, bounds, obstacles, labelBudget(t.k, items.length))
      nodeElsRef.current.forEach((el, id) => {
        const text = el.querySelector('text')
        const node = nodeById.get(id)
        if (!text || !node) return
        // Positions are in world units (the zoom layer scales them), so screen gaps divide by k.
        const side = sides.get(id) ?? null
        const r = nodeRadius(node)
        const gap = LABEL_GAP / t.k
        // Diagonal labels (#145) hang off a corner (r + gap) * DIAGONAL_OFFSET from the centre;
        // the baseline offsets match the box placeLabels reserved for them.
        const d = (r + gap) * DIAGONAL_OFFSET
        const [x, y, anchor] =
          side === 'left'
            ? [-(r + gap), 4 / t.k, 'end']
            : side === 'below'
              ? [0, r + gap + 11 / t.k, 'middle']
              : side === 'above'
                ? [0, -(r + gap + 3 / t.k), 'middle']
                : side === 'upper-right' || side === 'upper-left'
                  ? [side === 'upper-right' ? d : -d, -(d + 3 / t.k), side === 'upper-right' ? 'start' : 'end']
                  : side === 'lower-right' || side === 'lower-left'
                    ? [side === 'lower-right' ? d : -d, d + 11 / t.k, side === 'lower-right' ? 'start' : 'end']
                    : [r + gap, 4 / t.k, 'start']
        text.setAttribute('x', String(x))
        text.setAttribute('y', String(y))
        text.setAttribute('text-anchor', anchor)
        text.classList.toggle('graph-label-hidden', side === null)
      })
    }
    let placementFrame = 0
    function scheduleLabelPlacement() {
      if (placementFrame || typeof requestAnimationFrame === 'undefined') return
      placementFrame = requestAnimationFrame(() => {
        placementFrame = 0
        placeLabelsRef.current()
      })
    }

    const dragBehavior = d3drag<SVGGElement, unknown>()
      // A finger drags the view, not a dot: with dots a few px across a pan that starts on one would
      // grab it, and each touch would reheat the layout. Dragging a dot stays for the mouse (#78).
      .filter((event: Event) => !(event as MouseEvent).ctrlKey && !(event as MouseEvent).button && !event.type.startsWith('touch'))
      .on('start', function onStart(event) {
        const node = nodeById.get(this.dataset.nodeId ?? '')
        if (!node) return
        if (!event.active) {
          simulation.alphaTarget(0.3).restart()
          delete svgEl.dataset.layoutSettled
        }
        node.fx = node.x
        node.fy = node.y
      })
      .on('drag', function onDrag(event) {
        const node = nodeById.get(this.dataset.nodeId ?? '')
        if (!node) return
        node.fx = event.x
        node.fy = event.y
      })
      .on('end', function onEnd(event) {
        const node = nodeById.get(this.dataset.nodeId ?? '')
        if (!node) return
        if (!event.active) simulation.alphaTarget(0)
        node.fx = null
        node.fy = null
      })

    select(zoomLayerRef.current)
      .selectAll<SVGGElement, unknown>('.graph-node')
      .call(dragBehavior)
      .on('click', function onClick(event: MouseEvent) {
        // The browser's echo of a tap the pointer handler already acted on.
        if (event.timeStamp - tapHandledAtRef.current < TAP_ECHO_MS) return
        const nodeId = this.dataset.nodeId
        if (nodeId) selectNode(nodeId)
      })
      // SVG <g role="button"> has no native keyboard activation, so it's wired up explicitly
      // here to match the click handler above (#35) — same selectNode() call, no branching.
      .on('keydown', function onKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        const nodeId = this.dataset.nodeId
        if (nodeId) selectNode(nodeId)
      })

    let ticks = 0
    const renderTick = () => {
      edgeElsRef.current.forEach((el, i) => {
        const edge = simEdges[i]
        const source = edge?.source as SimNode | undefined
        const target = edge?.target as SimNode | undefined
        if (!el || !source || !target) return
        el.setAttribute('x1', String(source.x ?? 0))
        el.setAttribute('y1', String(source.y ?? 0))
        el.setAttribute('x2', String(target.x ?? 0))
        el.setAttribute('y2', String(target.y ?? 0))
      })
      nodeElsRef.current.forEach((el, id) => {
        const node = nodeById.get(id)
        if (!node) return
        const x = node.x ?? 0
        const y = node.y ?? 0
        el.setAttribute('transform', `translate(${x},${y})`)
        nodePositionsRef.current.set(id, { x, y })
      })
      positionPathEdges(zoomLayerRef.current, nodePositionsRef.current)
      if (++ticks % AUTOFIT_TICK_INTERVAL === 0) {
        // Keep the view framed while the layout is still spreading out.
        if (!initialFitDoneRef.current && highlightKeyRef.current === '') fitAllRef.current()
        scheduleLabelPlacement()
      }
    }
    simulation.on('tick', renderTick)

    // Positions settle after ~100+ ticks, so a selection made before this effect ran (e.g. a
    // globe click while the Inspector tab was active) needs one more pan attempt once real
    // positions exist (#45).
    const onSettled = () => {
      applyHighlightPanRef.current(true)
      placeLabelsRef.current()
      // Lets e2e wait for the final layout rather than guess how long the simulation runs.
      svgEl.dataset.layoutSettled = 'true'
    }
    simulation.on('end', onSettled)

    // "Reduce motion": lay the graph out in one go rather than animating it. The refs the settled
    // handler reads are assigned by the effects below, so it runs on the next frame.
    let settledFrame = 0
    if (prefersReducedMotion()) {
      settleSimulation(simulation)
      renderTick()
      settledFrame = requestAnimationFrame(onSettled)
    }

    // Switching layouts re-aims the forces, reheats the simulation and re-frames the view (#58).
    relayoutRef.current = (nextMode) => {
      applyLayoutMode(simulation, simNodes, nextMode, layoutWidth, layoutHeight)
      delete svgEl.dataset.layoutSettled
      initialFitDoneRef.current = false
      if (prefersReducedMotion()) {
        // A settled simulation is below alphaMin, so reheat it or the settle loop runs no ticks.
        simulation.alpha(1)
        settleSimulation(simulation)
        renderTick()
        requestAnimationFrame(onSettled)
      } else {
        simulation.alpha(1).restart()
      }
    }

    return () => {
      simulation.stop()
      if (placementFrame) cancelAnimationFrame(placementFrame)
      if (settledFrame) cancelAnimationFrame(settledFrame)
    }
    // Created once: a resize only re-frames the view (effect below). Re-seeding the layout on
    // every size change made nodes jump while the user resized the panes.
  }, [])

  // The first run is the mount, where the simulation was created in this mode already.
  const previousModeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
    if (previousModeRef.current === mode) return
    previousModeRef.current = mode
    relayoutRef.current(mode)
  }, [mode])

  // Frames the highlighted node(s) (the globe→graph direction of linking, #45) or, when nothing is
  // highlighted, the whole graph. Reads positions from nodePositionsRef rather than the sim
  // directly, since that ref is populated on every tick regardless of which effect is running.
  useEffect(() => {
    highlightKeyRef.current = highlightKey
    const highlightedIds = highlightKey ? highlightKey.split('|') : []
    const applyTransform = (fitInto: (inset: Inset) => FitTransform | null) => {
      const svgEl = svgRef.current
      const zoomBehavior = zoomBehaviorRef.current
      if (!svgEl || !zoomBehavior) return false
      // Frames into the part of the canvas the detail panel doesn't cover, so the selection's
      // neighbours (and their labels) aren't hidden under it (#141).
      const fit = fitInto(panelInset(detailPanelBox(svgEl, sheet), size.width, size.height))
      if (!fit) return false
      // d3-transition isn't a dependency here, so the pan/zoom is applied immediately rather
      // than animated (unlike MapLibre's flyTo in the reverse direction, #44).
      select(svgEl).call(zoomBehavior.transform, zoomIdentity.translate(fit.x, fit.y).scale(fit.k))
      return true
    }

    // Padding that gives way on a short canvas (#78), measured on the area the inset leaves free.
    const paddingFor = (inset: Inset, max: number) =>
      framingPadding(size.width - inset.left - inset.right, size.height - inset.top - inset.bottom, max)

    const fitAll = () => {
      const shown = [...nodePositionsRef.current].flatMap(([id, pos]) => {
        const node = drawnNodeById.get(id)
        return node && isNodeVisible(node, modeRef.current) ? [pos] : []
      })
      applyTransform((inset) => computeFitTransform(shown, size.width, size.height, paddingFor(inset, FIT_ALL_PADDING), 1, inset))
    }
    fitAllRef.current = fitAll

    const applyHighlightPan = (settled = false) => {
      positionPathEdges(zoomLayerRef.current, nodePositionsRef.current)
      if (highlightedIds.length === 0) {
        // Nothing is selected, so the whole graph is framed only while that is still the automatic
        // view. A resize, or a selection that was just dismissed, must not undo the user's pan (#78).
        if (!initialFitDoneRef.current) fitAll()
        if (settled) initialFitDoneRef.current = true
        return
      }
      // The layout settling is not a reason to move a view the user has since moved themselves.
      if (settled && userMovedRef.current) return
      if (!settled) userMovedRef.current = false
      const onlyId = highlightedIds.length === 1 ? (highlightedIds[0] as string) : null
      const ids = onlyId
        ? [onlyId, ...getNeighbors(graph, onlyId).flatMap((group) => group.neighbors.map((n) => n.node.id))]
        : highlightedIds
      const framed = ids.flatMap((id) => {
        const pos = nodePositionsRef.current.get(id)
        const node = graphNodeById.get(id)
        return pos && node ? [{ ...pos, radius: nodeRadius(node), labelWidth: labelWidthsRef.current.get(id) ?? 0 }] : []
      })
      applyTransform((inset) =>
        !onlyId && selection.selectedTaskId
          ? computePathFitTransform(framed, size.width, size.height, paddingFor(inset, 60), SELECTION_MAX_SCALE, inset, LABEL_GAP, PATH_MIN_SCALE, PATH_LINK_DISTANCE)
          : computeLabelledFitTransform(framed, size.width, size.height, paddingFor(inset, 60), SELECTION_MAX_SCALE, inset, LABEL_GAP),
      )
    }
    applyHighlightPanRef.current = applyHighlightPan
    applyHighlightPan()
    placeLabelsRef.current()
    // Keyed on the joined ids, not the array: highlightedIds is a fresh array every render, so
    // depending on it would reset the user's pan/zoom on each keystroke in the search box.
    // panelCollapsed and the sheet's size change the area the selection is framed into.
  }, [selection, size, highlightKey, panelCollapsed, sheet])

  // Label priority (#138): what the user asked for wins space first (the selection, task path or
  // globe point, then search matches), then theme hubs, then a single selected node's
  // neighbours. Separate from the pan effect above so typing in the search box re-places labels
  // without resetting the user's pan/zoom.
  useEffect(() => {
    const ids = highlightKey ? highlightKey.split('|') : []
    const priorities = new Map<string, number>()
    if (ids.length === 1) {
      getNeighbors(graph, ids[0] as string).forEach((group) => group.neighbors.forEach((n) => priorities.set(n.node.id, 1)))
    }
    graph.nodes.forEach((node) => {
      if (node.kind !== 'service') priorities.set(node.id, 3)
    })
    matchedIds?.forEach((id) => priorities.set(id, 4))
    ids.forEach((id) => priorities.set(id, 5))
    labelPriorityRef.current = priorities
    placeLabelsRef.current()
  }, [highlightKey, matchedIds])

  // Arrow keys pan and +/- zoom, for keyboard users who can't drag or scroll (#86). Only when the
  // canvas itself has focus, so typing in the search box or moving between nodes is untouched.
  // Moves the view as a pan or zoom key would, and says whether the key was one. The zoom buttons of
  // the phone layout use it too, as the single-pointer alternative to a pinch (#78).
  const nudgeView = (key: string): boolean => {
    const svgEl = svgRef.current
    const zoomBehavior = zoomBehaviorRef.current
    if (!svgEl || !zoomBehavior) return false
    const current = zoomTransform(svgEl)
    const next = keyboardViewTransform({ x: current.x, y: current.y, k: current.k }, key, size.width, size.height)
    if (!next) return false
    select(svgEl).call(zoomBehavior.transform, zoomIdentity.translate(next.x, next.y).scale(next.k))
    // A programmatic transform has no sourceEvent, so end the automatic framing explicitly.
    initialFitDoneRef.current = true
    userMovedRef.current = true
    return true
  }
  const onCanvasKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.target !== svgRef.current || event.ctrlKey || event.metaKey || event.altKey) return
    if (nudgeView(event.key)) event.preventDefault()
  }

  // Only this node is in the Tab order. Arrow keys, Home and End move focus along `focusOrder`, and
  // pan a node that is off the canvas, or under the detail panel, into view (#284).
  const tabStopId = rovingTabStop(focusOrder, lastFocusedId, selection.selectedNodeId)
  const onNodeKeyDown = (event: ReactKeyboardEvent<SVGGElement>, nodeId: string) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const targetId = rovingTarget(focusOrder, nodeId, event.key)
    if (!targetId) return
    event.preventDefault()
    nodeElsRef.current.get(targetId)?.focus()
    const svgEl = svgRef.current
    const zoomBehavior = zoomBehaviorRef.current
    const pos = nodePositionsRef.current.get(targetId)
    if (!svgEl || !zoomBehavior || !pos) return
    const current = zoomTransform(svgEl)
    const inset = panelInset(detailPanelBox(svgEl, sheet), size.width, size.height)
    const next = revealTransform({ x: current.x, y: current.y, k: current.k }, pos, size.width, size.height, REVEAL_MARGIN, inset)
    if (!next) return
    select(svgEl).call(zoomBehavior.transform, zoomIdentity.translate(next.x, next.y).scale(next.k))
    initialFitDoneRef.current = true
    userMovedRef.current = true
  }

  return (
    <section className="graph-view" aria-label="Graph">
      <div className="graph-toolbar">
        <GraphSearch
          query={query}
          onQueryChange={setQuery}
          matchCount={matchedIds?.size ?? null}
          {...(narrow
            ? {
                placeholder: 'Search APIs…',
                results: searchResults,
                onPick: (id: string) => {
                  selectNode(id)
                  setQuery('')
                },
              }
            : {})}
        />
        {/* The phone layout has Fit with the zoom buttons over the canvas instead. */}
        {!narrow && (
          <button type="button" className="graph-toolbar-button" onClick={() => fitAllRef.current()}>
            Fit
          </button>
        )}
        <div className="graph-mode-switch" role="group" aria-label="Graph layout">
          {LAYOUT_MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              className="graph-toolbar-button"
              aria-pressed={mode === option.mode}
              aria-label={option.label}
              title={option.title}
              onClick={() => setMode(option.mode)}
            >
              {narrow ? option.short : option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="graph-toolbar-button"
          aria-expanded={legendOpen}
          aria-controls="graph-legend"
          onClick={() => setLegendOpen((open) => !open)}
        >
          Legend
        </button>
      </div>
      <div className="graph-canvas" ref={containerRef}>
        <p id="graph-keyboard-hint" className="visually-hidden">
          With the graph focused, arrow keys pan and plus and minus zoom. Tab again to reach the services: arrow keys move
          between them, Home and End jump to the first and last, and Enter selects one.
        </p>
        <p className="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="selection-announcement">
          {announcement}
        </p>
        <svg
          ref={svgRef}
          width={size.width}
          height={size.height}
          role="group"
          aria-label="Service graph"
          aria-describedby="graph-keyboard-hint"
          tabIndex={0}
          onKeyDown={onCanvasKeyDown}
        >
          <g ref={zoomLayerRef}>
            <g className="graph-edges">
              {drawnEdges.map((edge, i) => (
                <line
                  key={`${edge.source}-${edge.target}-${edge.type}`}
                  className={`graph-edge ${EDGE_CLASS[edge.type]}${isEdgeVisible(edge, mode) ? '' : ' graph-hidden'}${isEdgeDimmed(focus, matchedIds, highlightedIds, edge.source, edge.target) ? ' graph-edge-dimmed' : ''}`}
                  data-edge-type={edge.type}
                  ref={(el) => {
                    edgeElsRef.current[i] = el as SVGLineElement
                  }}
                />
              ))}
            </g>
            <g className="graph-path-edges">
              {pathPairs.map(({ source, target }) => (
                <line
                  key={`${source}-${target}`}
                  className="graph-path-edge"
                  data-source={source}
                  data-target={target}
                />
              ))}
            </g>
            <g className="graph-nodes">
              {drawnNodes.map((node) => {
                const hub = node.kind === 'office' || node.kind === 'program' || node.kind === 'access'
                // Token-gated services get a ring in the access view (#60); `auth.type` is the source, not a method.
                const gated = mode === 'access' && node.kind === 'service' && node.auth.type !== 'none'
                const hidden = isNodeVisible(node, mode) ? '' : ' graph-hidden'
                return (
                  <g
                    key={node.id}
                    className={`${hub ? 'graph-org-node' : 'graph-node'} graph-node-${node.kind}${hidden}${gated ? ' graph-node-gated' : ''}${highlightedIds.includes(node.id) ? ' graph-node-highlighted' : ''}${matchedIds?.has(node.id) ? ' graph-node-match' : ''}${dimClass[nodeDim(focus, near, node.id)]}`}
                    data-node-id={node.id}
                    {...(hub
                      ? {}
                      : {
                          role: 'button',
                          tabIndex: node.id === tabStopId ? 0 : -1,
                          'aria-label': node.name,
                          'aria-pressed': selection.selectedNodeId === node.id,
                          onFocus: () => setLastFocusedId(node.id),
                          onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => onNodeKeyDown(event, node.id),
                        })}
                    ref={(el) => {
                      if (el) nodeElsRef.current.set(node.id, el)
                      else nodeElsRef.current.delete(node.id)
                    }}
                  >
                    <title>{node.name}</title>
                    <circle r={nodeRadius(node)} style={{ fill: nodeColor(node) }} />
                    <text x={nodeRadius(node) + 4} y={4}>
                      {labelText(node)}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        </svg>
        {narrow && (
          // Pinch and the arrow keys have no single-pointer equivalent on a touch screen without these.
          <div className="graph-zoom-controls" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom in" onClick={() => nudgeView('+')}>
              <span aria-hidden="true">+</span>
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => nudgeView('-')}>
              <span aria-hidden="true">−</span>
            </button>
            <button type="button" aria-label="Fit graph" onClick={() => fitAllRef.current()}>
              <span aria-hidden="true">⤢</span>
            </button>
          </div>
        )}
        {!narrow && <NodeDetailPanel collapsed={panelCollapsed} onToggleCollapsed={() => setPanelCollapsed((c) => !c)} />}
        {legendOpen && <GraphLegend mode={mode} />}
      </div>
    </section>
  )
}
