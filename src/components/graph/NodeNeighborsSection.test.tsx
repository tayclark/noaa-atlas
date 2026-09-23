// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSelection, getSelectionSnapshot } from '../../data/selectionStore'
import { NodeNeighborsSection } from './NodeNeighborsSection'

beforeEach(() => {
  clearSelection()
})

afterEach(cleanup)

describe('NodeNeighborsSection', () => {
  it('lists data-flow neighbors with reasons and source links', () => {
    render(<NodeNeighborsSection nodeId="nws-gis-portal" />)
    const region = screen.getByRole('region', { name: 'Relationships' })
    expect(region).toBeTruthy()
    expect(screen.getByText('Data flow')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'SPC GIS Data Feeds' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /source/i }).length).toBe(3)
  })

  it('shows the theme hub as plain text, not a button', () => {
    render(<NodeNeighborsSection nodeId="nws-gis-portal" />)
    expect(screen.getByText('Weather & forecast')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Weather & forecast' })).toBeNull()
  })

  it('selects the neighbor when its name is clicked', () => {
    render(<NodeNeighborsSection nodeId="nws-gis-portal" />)
    fireEvent.click(screen.getByRole('button', { name: 'SPC GIS Data Feeds' }))
    expect(getSelectionSnapshot().selectedNodeId).toBe('spc-gis-data')
  })

  it('renders nothing for a node with no edges', () => {
    const { container } = render(<NodeNeighborsSection nodeId="nope" />)
    expect(container.firstChild).toBeNull()
  })
})
