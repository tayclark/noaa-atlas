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
  it('defaults to the Finder tab', () => {
    render(<LeftPanel />)
    expect(screen.getByRole('tab', { name: 'Finder', selected: true })).toBeTruthy()
    expect(screen.getByText("Get today's local forecast")).toBeTruthy()
  })

  it('switches to the Inspector tab and back', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }))
    expect(screen.getByText('No live requests yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Finder' }))
    expect(screen.getByText("Get today's local forecast")).toBeTruthy()
  })

  it('switches to the Graph tab', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
  })
})
