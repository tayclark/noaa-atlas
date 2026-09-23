// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import type { ServiceNode } from '../../data/graphSchema'
import { parseGraphFile } from '../../data/graphSchema'
import { clearSelection, selectNode } from '../../data/selectionStore'
import { NodeDetailPanel } from './NodeDetailPanel'

const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]

beforeEach(() => {
  clearSelection()
})

afterEach(cleanup)

describe('NodeDetailPanel', () => {
  it('renders nothing when no node is selected', () => {
    const { container } = render(<NodeDetailPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the selected node\'s detail fields', () => {
    const node = nodes.find((n) => n.id === 'nws-api')
    if (!node) throw new Error('expected fixture node nws-api')
    selectNode(node.id)
    render(<NodeDetailPanel />)

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
    render(<NodeDetailPanel />)

    expect(screen.getByText('Available, not live yet')).toBeTruthy()
    if (node.notLiveReason) expect(screen.getByText(node.notLiveReason)).toBeTruthy()
  })

  it('renders the newly selected node after selection changes', () => {
    const first = nodes[0]
    const second = nodes[1]
    if (!first || !second) throw new Error('expected at least two fixture nodes')

    selectNode(first.id)
    const { unmount } = render(<NodeDetailPanel />)
    expect(screen.getByText(first.name)).toBeTruthy()
    unmount()

    selectNode(second.id)
    render(<NodeDetailPanel />)
    expect(screen.getByText(second.name)).toBeTruthy()
  })
})
