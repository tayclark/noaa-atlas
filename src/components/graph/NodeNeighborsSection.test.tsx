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
    expect(screen.getByText('Data flows into')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'SPC GIS Data Feeds' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /source/i }).length).toBe(3)
  })

  it('links to the theme hub without repeating its name as a reason', () => {
    render(<NodeNeighborsSection nodeId="nws-gis-portal" />)
    fireEvent.click(screen.getByRole('button', { name: 'Weather & forecast' }))
    expect(getSelectionSnapshot().selectedNodeId).toBe('theme-weather')
    expect(screen.getAllByText('Weather & forecast')).toHaveLength(1)
  })

  it('lists a theme hub under the NOAA root', () => {
    render(<NodeNeighborsSection nodeId="theme-ocean" />)
    expect(screen.getByText('NOAA → theme')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'NOAA' })).toBeTruthy()
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
