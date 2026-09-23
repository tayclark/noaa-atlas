// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GraphView } from './GraphView'
import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile } from '../../data/graphSchema'
import { clearSelection, getHighlightedNodeIds, getSelectionSnapshot, selectNode, selectPoint } from '../../data/selectionStore'
import { THEME_COLORS } from '../../data/themeColors'
import { EDGE_CLASS } from './graphLayout'

beforeEach(() => {
  clearSelection()
})

afterEach(cleanup)

const expectedGraph = buildGraph(parseGraphFile(graphJson))

describe('GraphView', () => {
  it('renders as a named region with a node per graph node', () => {
    render(<GraphView />)
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(expectedGraph.nodes.length)
  })

  it('colors each node circle by its theme', () => {
    const { container } = render(<GraphView />)
    for (const node of expectedGraph.nodes) {
      const el = container.querySelector(`[data-node-id="${node.id}"] circle`)
      expect((el as SVGCircleElement | null)?.style.fill).toBe(hexToRgb(THEME_COLORS[node.theme]))
    }
  })

  it('classes each edge line by its edge type', () => {
    const { container } = render(<GraphView />)
    for (const edge of expectedGraph.edges) {
      const lines = container.querySelectorAll(`[data-edge-type="${edge.type}"]`)
      expect(lines.length).toBeGreaterThan(0)
      lines.forEach((line) => expect(line.getAttribute('class')).toBe(`graph-edge ${EDGE_CLASS[edge.type]}`))
    }
  })

  it('renders the legend', () => {
    render(<GraphView />)
    expect(screen.getByLabelText('Legend')).toBeTruthy()
  })

  it('selects a node in the shared selection store on click', () => {
    render(<GraphView />)
    const firstNode = expectedGraph.nodes[0]
    if (!firstNode) throw new Error('expected at least one graph node')
    fireEvent.click(screen.getByRole('button', { name: firstNode.name }))
    expect(getSelectionSnapshot().selectedNodeId).toBe(firstNode.id)
  })

  // jsdom's SVG implementation doesn't support the geometry APIs (e.g. viewBox.baseVal) that
  // d3-zoom/d3-drag read from real pointer events, so wheel/mousedown simulation here would
  // surface jsdom-only errors rather than exercising real behavior. Pan/zoom/drag — including
  // the pan-to-highlighted-node(s) behavior added for #45 — are verified manually against a
  // real browser instead (see the issue's PR description).
  it('mounts and unmounts without throwing, stopping the simulation cleanly', () => {
    const { unmount } = render(<GraphView />)
    expect(() => unmount()).not.toThrow()
  })

  it('highlights the selected node (globe node selection, #44 reverse direction)', () => {
    const firstNode = expectedGraph.nodes[0]
    if (!firstNode) throw new Error('expected at least one graph node')
    selectNode(firstNode.id)
    const { container } = render(<GraphView />)
    const el = container.querySelector(`[data-node-id="${firstNode.id}"]`)
    expect(el?.getAttribute('class')).toContain('graph-node-highlighted')
  })

  it('highlights every node covering a selected globe point (#45)', () => {
    const kansas: [number, number] = [-98, 39] // covered by nws-api and spc-gis-data
    selectPoint(kansas)
    const highlighted = getHighlightedNodeIds()
    expect(highlighted).toContain('nws-api')
    expect(highlighted).toContain('spc-gis-data')
    const { container } = render(<GraphView />)
    for (const id of highlighted) {
      expect(container.querySelector(`[data-node-id="${id}"]`)?.getAttribute('class')).toContain(
        'graph-node-highlighted',
      )
    }
    const notHighlighted = expectedGraph.nodes.filter((n) => !highlighted.includes(n.id))
    for (const node of notHighlighted) {
      expect(container.querySelector(`[data-node-id="${node.id}"]`)?.getAttribute('class')).not.toContain(
        'graph-node-highlighted',
      )
    }
  })
})

// jsdom normalizes inline `style.fill` hex values to rgb(); compare against that form rather
// than the raw hex string.
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}
