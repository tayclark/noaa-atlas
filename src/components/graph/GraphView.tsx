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
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import './GraphView.css'
import graphJson from '../../data/graph.json'
import tasksJson from '../../data/tasks.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile } from '../../data/graphSchema'
import { getNeighbors } from '../../data/neighbors'
import { parseTasksFile } from '../../data/taskSchema'
import {
  getHighlightedNodeIds,
  getSelectedTaskPath,
  getSelectionSnapshot,
  selectNode,
  subscribeSelection,
} from '../../data/selectionStore'
import { THEME_COLORS } from '../../data/themeColors'
import { computeFitTransform, createGraphSimulation, EDGE_CLASS, nodeRadius, type SimEdge, type SimNode } from './graphLayout'
import { GraphLegend } from './GraphLegend'
import { GraphSearch } from './GraphSearch'
import { buildSearchIndex, matchNodeIds } from './searchMatch'
import { NodeDetailPanel } from './NodeDetailPanel'

const graph = buildGraph(parseGraphFile(graphJson))
// A selected node is framed together with its neighbors, at a scale capped so labels stay legible.
const SELECTION_MAX_SCALE = 1.25
const FIT_ALL_PADDING = 40
// Node labels extend to the right of the node centre; the fit is computed from centres only, so
// this stands in for the label width to keep the last column of labels inside the view.
const LABEL_ALLOWANCE = 140
const AUTOFIT_TICK_INTERVAL = 20

const searchIndex = buildSearchIndex(graph.nodes, parseTasksFile(tasksJson).tasks)

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
  // The first settled layout is auto-fit once; later settles (e.g. after a node drag) must not
  // yank the view away from where the user left it.
  const initialFitDoneRef = useRef(false)
  const [size, setSize] = useState({ width: 600, height: 400 })
  const initialSizeRef = useRef(size)
  const [legendOpen, setLegendOpen] = useState(false)
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const highlightedIds = getHighlightedNodeIds()
  const highlightKey = highlightedIds.join('|')
  const taskPath = getSelectedTaskPath()
  const pathPairs = taskPath.slice(1).map((target, i) => ({ source: taskPath[i] as string, target }))
  const [query, setQuery] = useState('')
  const matchedIds = useMemo(() => matchNodeIds(searchIndex, query), [query])

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

    const simNodes: SimNode[] = graph.nodes.map((node) => ({ ...node }))
    const simEdges: SimEdge[] = graph.edges.map((edge) => ({ ...edge }))
    const simulation = createGraphSimulation(simNodes, simEdges, initialSizeRef.current.width, initialSizeRef.current.height)

    const svg = select(svgRef.current)
    const zoomLayer = select(zoomLayerRef.current)

    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', (event: { transform: ZoomTransform; sourceEvent: unknown }) => {
        zoomLayer.attr('transform', event.transform.toString())
        // Pan/zoom by the user (not our programmatic fit) ends the automatic framing.
        if (event.sourceEvent) initialFitDoneRef.current = true
      })
    svg.call(zoomBehavior)
    zoomBehaviorRef.current = zoomBehavior

    const nodeById = new Map(simNodes.map((node) => [node.id, node]))

    const dragBehavior = d3drag<SVGGElement, unknown>()
      .on('start', function onStart(event) {
        const node = nodeById.get(this.dataset.nodeId ?? '')
        if (!node) return
        if (!event.active) simulation.alphaTarget(0.3).restart()
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
      .on('click', function onClick() {
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
    simulation.on('tick', () => {
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
      // Keep the view framed while the layout is still spreading out.
      if (++ticks % AUTOFIT_TICK_INTERVAL === 0 && !initialFitDoneRef.current && highlightKeyRef.current === '') {
        fitAllRef.current()
      }
    })

    // Positions settle after ~100+ ticks, so a selection made before this effect ran (e.g. a
    // globe click while the Inspector tab was active) needs one more pan attempt once real
    // positions exist (#45).
    simulation.on('end', () => applyHighlightPanRef.current(true))

    return () => {
      simulation.stop()
    }
    // Created once: a resize only re-frames the view (effect below). Re-seeding the layout on
    // every size change made nodes jump while the user resized the panes.
  }, [])

  // Frames the highlighted node(s) (the globe→graph direction of linking, #45) or, when nothing is
  // highlighted, the whole graph. Reads positions from nodePositionsRef rather than the sim
  // directly, since that ref is populated on every tick regardless of which effect is running.
  useEffect(() => {
    highlightKeyRef.current = highlightKey
    const highlightedIds = highlightKey ? highlightKey.split('|') : []
    const applyTransform = (positions: { x: number; y: number }[], padding: number, maxScale: number) => {
      const svgEl = svgRef.current
      const zoomBehavior = zoomBehaviorRef.current
      if (!svgEl || !zoomBehavior) return false
      const fit = computeFitTransform(positions, size.width, size.height, padding, maxScale)
      if (!fit) return false
      // d3-transition isn't a dependency here, so the pan/zoom is applied immediately rather
      // than animated (unlike MapLibre's flyTo in the reverse direction, #44).
      select(svgEl).call(zoomBehavior.transform, zoomIdentity.translate(fit.x, fit.y).scale(fit.k))
      return true
    }
    const positionsOf = (ids: readonly string[]) =>
      ids.map((id) => nodePositionsRef.current.get(id)).filter((p): p is { x: number; y: number } => p !== undefined)

    const fitAll = () => {
      const positions = [...nodePositionsRef.current.values()].flatMap((p) => [p, { x: p.x + LABEL_ALLOWANCE, y: p.y }])
      applyTransform(positions, FIT_ALL_PADDING, 1)
    }
    fitAllRef.current = fitAll

    const applyHighlightPan = (settled = false) => {
      positionPathEdges(zoomLayerRef.current, nodePositionsRef.current)
      if (highlightedIds.length === 0) {
        if (!settled || !initialFitDoneRef.current) fitAll()
        if (settled) initialFitDoneRef.current = true
        return
      }
      const onlyId = highlightedIds.length === 1 ? (highlightedIds[0] as string) : null
      const ids = onlyId
        ? [onlyId, ...getNeighbors(graph, onlyId).flatMap((group) => group.neighbors.map((n) => n.node.id))]
        : highlightedIds
      applyTransform(positionsOf(ids), 60, SELECTION_MAX_SCALE)
    }
    applyHighlightPanRef.current = applyHighlightPan
    applyHighlightPan()
    // Keyed on the joined ids, not the array: highlightedIds is a fresh array every render, so
    // depending on it would reset the user's pan/zoom on each keystroke in the search box.
  }, [selection, size, highlightKey])

  return (
    <section className="graph-view" aria-label="Graph">
      <div className="graph-toolbar">
        <GraphSearch query={query} onQueryChange={setQuery} matchCount={matchedIds?.size ?? null} />
        <button type="button" className="graph-toolbar-button" onClick={() => fitAllRef.current()}>
          Fit
        </button>
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
        <svg ref={svgRef} width={size.width} height={size.height}>
          <g ref={zoomLayerRef}>
            <g className="graph-edges">
              {graph.edges.map((edge, i) => (
                <line
                  key={`${edge.source}-${edge.target}-${edge.type}`}
                  className={`graph-edge ${EDGE_CLASS[edge.type]}${matchedIds && !(matchedIds.has(edge.source) && matchedIds.has(edge.target)) ? ' graph-edge-dimmed' : ''}`}
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
              {graph.nodes.map((node) => (
                <g
                  key={node.id}
                  className={`graph-node graph-node-${node.kind}${highlightedIds.includes(node.id) ? ' graph-node-highlighted' : ''}${matchedIds ? (matchedIds.has(node.id) ? ' graph-node-match' : ' graph-node-dimmed') : ''}`}
                  data-node-id={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={node.name}
                  ref={(el) => {
                    if (el) nodeElsRef.current.set(node.id, el)
                    else nodeElsRef.current.delete(node.id)
                  }}
                >
                  <circle r={nodeRadius(node)} style={{ fill: THEME_COLORS[node.theme] }} />
                  <text x={nodeRadius(node) + 4} y={4}>
                    {node.name}
                  </text>
                </g>
              ))}
            </g>
          </g>
        </svg>
        <NodeDetailPanel />
        {legendOpen && <GraphLegend />}
      </div>
    </section>
  )
}
