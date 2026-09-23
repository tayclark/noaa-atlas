// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GraphView } from './GraphView'
import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import { parseGraphFile } from '../../data/graphSchema'
import { clearSelection, getSelectionSnapshot } from '../../data/selectionStore'

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

  it('selects a node in the shared selection store on click', () => {
    render(<GraphView />)
    const firstNode = expectedGraph.nodes[0]
    if (!firstNode) throw new Error('expected at least one graph node')
    fireEvent.click(screen.getByRole('button', { name: firstNode.name }))
    expect(getSelectionSnapshot().selectedNodeId).toBe(firstNode.id)
  })

  // jsdom's SVG implementation doesn't support the geometry APIs (e.g. viewBox.baseVal) that
  // d3-zoom/d3-drag read from real pointer events, so wheel/mousedown simulation here would
  // surface jsdom-only errors rather than exercising real behavior. Pan/zoom/drag are verified
  // manually against a real browser instead (see the issue's PR description).
  it('mounts and unmounts without throwing, stopping the simulation cleanly', () => {
    const { unmount } = render(<GraphView />)
    expect(() => unmount()).not.toThrow()
  })
})
