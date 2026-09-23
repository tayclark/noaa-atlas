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
import { zoom as d3zoom, type ZoomTransform } from 'd3-zoom'
import { useEffect, useRef, useState } from 'react'
import './GraphView.css'
import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile } from '../../data/graphSchema'
import { selectNode } from '../../data/selectionStore'
import { THEME_COLORS } from '../../data/themeColors'
import { createGraphSimulation, EDGE_CLASS, nodeRadius, type SimEdge, type SimNode } from './graphLayout'
import { GraphLegend } from './GraphLegend'
import { NodeDetailPanel } from './NodeDetailPanel'

const graph = buildGraph(parseGraphFile(graphJson))

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomLayerRef = useRef<SVGGElement>(null)
  const nodeElsRef = useRef(new Map<string, SVGGElement>())
  const edgeElsRef = useRef<SVGLineElement[]>([])
  const [size, setSize] = useState({ width: 600, height: 400 })

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
    const simulation = createGraphSimulation(simNodes, simEdges, size.width, size.height)

    const svg = select(svgRef.current)
    const zoomLayer = select(zoomLayerRef.current)

    const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 4])
      .on('zoom', (event: { transform: ZoomTransform }) => {
        zoomLayer.attr('transform', event.transform.toString())
      })
    svg.call(zoomBehavior)

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
        el.setAttribute('transform', `translate(${node.x ?? 0},${node.y ?? 0})`)
      })
    })

    return () => {
      simulation.stop()
    }
  }, [size])

  return (
    <section className="graph-view" aria-label="Graph" ref={containerRef}>
      <svg ref={svgRef} width={size.width} height={size.height}>
        <g ref={zoomLayerRef}>
          <g className="graph-edges">
            {graph.edges.map((edge, i) => (
              <line
                key={`${edge.source}-${edge.target}-${edge.type}`}
                className={`graph-edge ${EDGE_CLASS[edge.type]}`}
                data-edge-type={edge.type}
                ref={(el) => {
                  edgeElsRef.current[i] = el as SVGLineElement
                }}
              />
            ))}
          </g>
          <g className="graph-nodes">
            {graph.nodes.map((node) => (
              <g
                key={node.id}
                className={`graph-node graph-node-${node.kind}`}
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
      <GraphLegend />
    </section>
  )
}
