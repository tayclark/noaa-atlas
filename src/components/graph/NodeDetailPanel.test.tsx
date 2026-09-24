// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import type { ServiceNode } from '../../data/graphSchema'
import { parseGraphFile, THEME_DESCRIPTIONS, THEME_LABELS } from '../../data/graphSchema'
import { clearSelection, getSelectionSnapshot, selectNode } from '../../data/selectionStore'
import { NodeDetailPanel } from './NodeDetailPanel'

const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]

const panel = <NodeDetailPanel collapsed={false} onToggleCollapsed={() => {}} />

beforeEach(() => {
  clearSelection()
})

afterEach(cleanup)

describe('NodeDetailPanel', () => {
  it('renders nothing when no node is selected', () => {
    const { container } = render(panel)
    expect(container.firstChild).toBeNull()
  })

  it('renders the selected node\'s detail fields', () => {
    const node = nodes.find((n) => n.id === 'nws-api')
    if (!node) throw new Error('expected fixture node nws-api')
    selectNode(node.id)
    render(panel)

    expect(screen.getByLabelText('Node detail')).toBeTruthy()
    expect(screen.getByText(node.name)).toBeTruthy()
    expect(screen.getByText(node.baseUrl)).toBeTruthy()
    expect(screen.getByText(node.lastVerified)).toBeTruthy()
    expect(screen.getByText(node.liveLayer ? 'Live' : 'Available, not live yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: /official docs/i }).getAttribute('href')).toBe(node.docUrl)
  })

  it('shows the not-live reason for a not-live node', () => {
    const node = nodes.find((n) => !n.liveLayer)
    if (!node) throw new Error('expected at least one not-live fixture node')
    selectNode(node.id)
    render(panel)

    expect(screen.getByText('Available, not live yet')).toBeTruthy()
    if (node.notLiveReason) expect(screen.getByText(node.notLiveReason)).toBeTruthy()
  })

  it('renders the newly selected node after selection changes', () => {
    const first = nodes[0]
    const second = nodes[1]
    if (!first || !second) throw new Error('expected at least two fixture nodes')

    selectNode(first.id)
    const { unmount } = render(panel)
    expect(screen.getByText(first.name)).toBeTruthy()
    unmount()

    selectNode(second.id)
    render(panel)
    expect(screen.getByText(second.name)).toBeTruthy()
  })

  it('summarizes a selected theme hub and links to its services (#145)', () => {
    const services = nodes.filter((n) => n.theme === 'ocean')
    selectNode('theme-ocean')
    render(panel)

    expect(screen.getByRole('heading', { name: THEME_LABELS.ocean })).toBeTruthy()
    expect(screen.getByText(THEME_DESCRIPTIONS.ocean)).toBeTruthy()
    const live = services.filter((n) => n.liveLayer).length
    expect(screen.getByRole('heading', { name: `${services.length} services · ${live} live` })).toBeTruthy()
    expect(screen.queryByText('Base URL')).toBeNull()

    const first = services[0]
    if (!first) throw new Error('expected an ocean fixture node')
    fireEvent.click(screen.getByRole('button', { name: first.name }))
    expect(getSelectionSnapshot().selectedNodeId).toBe(first.id)
  })

  it('shows only the title bar when collapsed, with a toggle that reports its state (#141)', () => {
    const node = nodes.find((n) => n.id === 'nws-api')
    if (!node) throw new Error('expected fixture node nws-api')
    selectNode(node.id)
    let toggled = 0
    const { rerender } = render(<NodeDetailPanel collapsed={false} onToggleCollapsed={() => toggled++} />)

    const collapse = screen.getByRole('button', { name: 'Collapse details' })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(collapse)
    expect(toggled).toBe(1)

    rerender(<NodeDetailPanel collapsed onToggleCollapsed={() => toggled++} />)
    expect(screen.getByText(node.name)).toBeTruthy()
    expect(screen.queryByText(node.baseUrl)).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand details' }).getAttribute('aria-expanded')).toBe('false')
  })
})
