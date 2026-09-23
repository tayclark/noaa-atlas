// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LeftPanel } from './LeftPanel'
import { clearRequestLog } from '../data/requestLog'
import { clearSelection } from '../data/selectionStore'

beforeEach(() => {
  clearRequestLog()
  clearSelection()
})

afterEach(cleanup)

describe('LeftPanel', () => {
  it('defaults to the Explore tab, showing the finder and the graph together', () => {
    render(<LeftPanel />)
    expect(screen.getByRole('tab', { name: 'Explore', selected: true })).toBeTruthy()
    expect(screen.getByText("Get today's local forecast")).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
  })

  it('switches to the Inspector tab and back', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }))
    expect(screen.getByText('No live requests yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Explore' }))
    expect(screen.getByText("Get today's local forecast")).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
  })
})
