// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import graphJson from '../../data/graph.json'
import { buildGraph } from '../../data/buildGraph'
import type { ServiceNode, ThemeNode } from '../../data/graphSchema'
import { parseGraphFile, THEME_DESCRIPTIONS, THEME_LABELS } from '../../data/graphSchema'
import { clearCompare, getCompareSnapshot } from '../../data/compareStore'
import { getPoint } from '../../data/nwsClient'
import { clearSelection, getSelectionSnapshot, selectNode } from '../../data/selectionStore'
import { NodeDetailPanel } from './NodeDetailPanel'
import { RootDetailBody } from './RootDetailBody'
import { ThemeDetailBody } from './ThemeDetailBody'

vi.mock('../../data/nwsClient', () => ({ getPoint: vi.fn() }))

const file = parseGraphFile(graphJson)
const nodes = file.nodes as ServiceNode[]

const panel = <NodeDetailPanel collapsed={false} onToggleCollapsed={() => {}} />

beforeEach(() => {
  clearSelection()
  clearCompare()
  vi.mocked(getPoint).mockReset()
})

afterEach(cleanup)

describe('NodeDetailPanel', () => {
  it('renders nothing when no node is selected', () => {
    const { container } = render(panel)
    expect(container.firstChild).toBeNull()
  })

  it('toggles the node in and out of the compare set', () => {
    selectNode('nws-api')
    render(panel)
    fireEvent.click(screen.getByRole('button', { name: 'Add to compare' }))
    expect(getCompareSnapshot()).toEqual(['nws-api'])
    fireEvent.click(screen.getByRole('button', { name: 'Remove from compare' }))
    expect(getCompareSnapshot()).toEqual([])
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

  it('shows the next node\'s static sample, not the previous node\'s run result (#262)', async () => {
    vi.mocked(getPoint).mockResolvedValue({ gridId: 'TOP' } as never)
    selectNode('nws-api')
    render(panel)
    fireEvent.click(screen.getByRole('button', { name: 'Run sample' }))
    await waitFor(() => expect(screen.getByText('Live response (parsed)')).toBeTruthy())

    act(() => selectNode('ncei-access-data-service'))
    expect(screen.getByText('Static sample')).toBeTruthy()
    expect(screen.queryByText(/"gridId"/)).toBeNull()
  })

  it('drops a run that finishes after the selection has moved on (#262)', async () => {
    let resolve: (value: unknown) => void = () => {}
    vi.mocked(getPoint).mockReturnValue(new Promise((r) => (resolve = r)) as never)
    selectNode('nws-api')
    render(panel)
    fireEvent.click(screen.getByRole('button', { name: 'Run sample' }))
    expect(screen.getByRole('button', { name: 'Running…' })).toBeTruthy()

    act(() => selectNode('ncei-access-data-service'))
    await act(async () => resolve({ gridId: 'TOP' }))
    expect(screen.getByText('Static sample')).toBeTruthy()
    expect(screen.queryByText(/"gridId"/)).toBeNull()
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

  it('gives an overview of every theme for the NOAA root, linking to the hubs (#148)', () => {
    selectNode('noaa')
    render(panel)

    expect(screen.getByRole('heading', { name: 'NOAA' })).toBeTruthy()
    const live = nodes.filter((n) => n.liveLayer).length
    expect(screen.getByRole('heading', { name: `${nodes.length} services · ${live} live` })).toBeTruthy()
    expect(screen.queryByText('none yet')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: THEME_LABELS.ocean }))
    expect(getSelectionSnapshot().selectedNodeId).toBe('theme-ocean')
  })

  it('says a theme with no services has none yet, on the root and on its hub', () => {
    const graph = buildGraph({ ...file, nodes: file.nodes.filter((n) => n.theme !== 'space-weather'), edges: [] })
    const hub = graph.nodes.find((n): n is ThemeNode => n.id === 'theme-space-weather')
    if (!hub) throw new Error('expected the space-weather hub')

    const { unmount } = render(<RootDetailBody graph={graph} />)
    expect(screen.getByText('none yet')).toBeTruthy()
    unmount()

    render(<ThemeDetailBody node={hub} graph={graph} />)
    expect(screen.getByText('No services curated yet.')).toBeTruthy()
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
