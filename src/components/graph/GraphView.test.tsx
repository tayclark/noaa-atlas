// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GraphView } from './GraphView'
import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile } from '../../data/graphSchema'
import { clearSelection, getHighlightedNodeIds, getSelectionSnapshot, selectNode, selectPoint, selectTask } from '../../data/selectionStore'
import { parseTasksFile } from '../../data/taskSchema'
import tasksJson from '../../data/tasks.json'
import { nodeColor } from '../../data/themeColors'
import { EDGE_CLASS } from './graphLayout'

beforeEach(() => {
  clearSelection()
})

afterEach(cleanup)

const expectedGraph = buildGraph(parseGraphFile(graphJson))
const tasks = parseTasksFile(tasksJson).tasks

describe('GraphView', () => {
  it('renders as a named region with a node per graph node', () => {
    const { container } = render(<GraphView />)
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
    expect(container.querySelectorAll('.graph-node')).toHaveLength(expectedGraph.nodes.length)
  })

  it('labels a node with its shortName but keeps the full name accessible (#141)', () => {
    const { container } = render(<GraphView />)
    const node = container.querySelector<SVGGElement>('.graph-node[data-node-id="mrms-aws-open-data"]')!
    expect(node.querySelector('text')?.textContent).toBe('MRMS (AWS)')
    expect(node.getAttribute('aria-label')).toMatch(/^MRMS multi-radar/)
    expect(node.querySelector('title')?.textContent).toMatch(/^MRMS multi-radar/)
  })

  it('keeps the detail panel collapsed across selection changes (#141)', () => {
    const { container } = render(<GraphView />)
    act(() => selectNode('nws-api'))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }))
    expect(container.querySelector('.node-detail-panel-collapsed')).not.toBeNull()

    act(() => selectNode('coops-data-api'))
    expect(screen.getByRole('button', { name: 'Expand details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand details' }))
    expect(container.querySelector('.node-detail-panel-collapsed')).toBeNull()
  })

  it('colors each node circle by its theme (the root is neutral)', () => {
    const { container } = render(<GraphView />)
    for (const node of expectedGraph.nodes) {
      const el = container.querySelector(`[data-node-id="${node.id}"] circle`)
      expect((el as SVGCircleElement | null)?.style.fill).toBe(hexToRgb(nodeColor(node)))
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

  it('keeps the legend collapsed until its toolbar toggle is used', () => {
    render(<GraphView />)
    const toggle = screen.getByRole('button', { name: 'Legend' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByLabelText('Legend')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Legend')).toBeTruthy()
    fireEvent.click(toggle)
    expect(screen.queryByLabelText('Legend')).toBeNull()
  })

  it('has a Fit control in the toolbar that does not throw before the layout has settled', () => {
    render(<GraphView />)
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
  })

  it('selects a node in the shared selection store on click', () => {
    render(<GraphView />)
    const firstNode = expectedGraph.nodes[0]
    if (!firstNode) throw new Error('expected at least one graph node')
    fireEvent.click(screen.getByRole('button', { name: firstNode.name }))
    expect(getSelectionSnapshot().selectedNodeId).toBe(firstNode.id)
  })

  it('selects a node in the shared selection store on Enter key (#35)', () => {
    render(<GraphView />)
    const firstNode = expectedGraph.nodes[0]
    if (!firstNode) throw new Error('expected at least one graph node')
    fireEvent.keyDown(screen.getByRole('button', { name: firstNode.name }), { key: 'Enter' })
    expect(getSelectionSnapshot().selectedNodeId).toBe(firstNode.id)
  })

  it('selects a node in the shared selection store on Space key and prevents default scroll (#35)', () => {
    render(<GraphView />)
    const firstNode = expectedGraph.nodes[0]
    if (!firstNode) throw new Error('expected at least one graph node')
    const notCanceled = fireEvent.keyDown(screen.getByRole('button', { name: firstNode.name }), { key: ' ' })
    expect(notCanceled).toBe(false)
    expect(getSelectionSnapshot().selectedNodeId).toBe(firstNode.id)
  })

  it('ignores unrelated key presses on a graph node (#35)', () => {
    render(<GraphView />)
    const firstNode = expectedGraph.nodes[0]
    if (!firstNode) throw new Error('expected at least one graph node')
    fireEvent.keyDown(screen.getByRole('button', { name: firstNode.name }), { key: 'a' })
    expect(getSelectionSnapshot().selectedNodeId).toBeNull()
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

  it("highlights a selected task's whole path and draws a connector between consecutive steps (#34)", () => {
    for (const task of tasks) {
      clearSelection()
      selectTask(task.id)
      const { container, unmount } = render(<GraphView />)
      const path = task.nodes.map((n) => n.nodeId)
      const highlighted = [...container.querySelectorAll('.graph-node-highlighted')].map((el) =>
        el.getAttribute('data-node-id'),
      )
      expect(highlighted.sort()).toEqual([...path].sort())
      const connectors = [...container.querySelectorAll('.graph-path-edge')].map(
        (el) => `${el.getAttribute('data-source')}>${el.getAttribute('data-target')}`,
      )
      expect(connectors).toEqual(path.slice(1).map((id, i) => `${path[i]}>${id}`))
      unmount()
    }
  })

  it('draws no path connectors for a node or point selection', () => {
    selectNode('nws-api')
    const { container } = render(<GraphView />)
    expect(container.querySelectorAll('.graph-path-edge')).toHaveLength(0)
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

describe('GraphView search', () => {
  const nodeClass = (container: HTMLElement, id: string) =>
    container.querySelector(`[data-node-id="${id}"]`)?.getAttribute('class') ?? ''

  it('marks matches and dims the rest, then restores on clear', () => {
    const { container } = render(<GraphView />)
    const input = screen.getByRole('searchbox', { name: 'Search graph' })
    fireEvent.change(input, { target: { value: 'tornado' } })
    expect(nodeClass(container, 'spc-gis-data')).toContain('graph-node-match')
    expect(nodeClass(container, 'nws-api')).toContain('graph-node-dimmed')
    expect(screen.getByRole('status').textContent).toMatch(/match/)

    fireEvent.change(input, { target: { value: '' } })
    expect(nodeClass(container, 'nws-api')).not.toContain('graph-node-dimmed')
    expect(nodeClass(container, 'spc-gis-data')).not.toContain('graph-node-match')
  })

  it('shows a no-results message when nothing matches', () => {
    render(<GraphView />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search graph' }), { target: { value: 'xyzzy' } })
    expect(screen.getByRole('status').textContent).toBe('No matches for "xyzzy"')
  })

  it('clears the query on Escape', () => {
    render(<GraphView />)
    const input = screen.getByRole('searchbox', { name: 'Search graph' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'tornado' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
  })
})
