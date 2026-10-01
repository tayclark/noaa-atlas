// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LeftPanel } from './LeftPanel'
import { addCompare, clearCompare } from '../data/compareStore'
import { clearRequestLog, pushLogEntry } from '../data/requestLog'
import { clearSelection, selectNode } from '../data/selectionStore'

beforeEach(() => {
  clearRequestLog()
  clearSelection()
  clearCompare()
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
    expect(screen.getByText(/No live requests yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Explore' }))
    expect(screen.getByText("Get today's local forecast")).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
  })

  it('counts logged requests on the Inspector tab (#150)', () => {
    pushLogEntry({
      id: 'a',
      method: 'GET',
      url: 'https://api.weather.gov/alerts/active',
      path: '/alerts/active',
      requestHeaders: {},
      startedAt: 0,
      durationMs: 1,
      status: 'success',
    })
    render(<LeftPanel />)
    expect(screen.getByRole('tab', { name: /^Inspector\s*1 request$/ })).toBeTruthy()
  })

  it('shows how many services are picked on the Compare tab', () => {
    addCompare(['nws-api', 'swpc-alerts-scales'])
    render(<LeftPanel />)
    expect(screen.getByRole('tab', { name: /^Compare\s*2 selected$/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Compare/ }))
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
  })

  it('wires tabs to the panel and keeps only the active tab in the Tab order', () => {
    render(<LeftPanel />)
    const explore = screen.getByRole('tab', { name: 'Explore' })
    const panel = screen.getByRole('tabpanel')
    expect(explore.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(explore.id)
    expect(explore.tabIndex).toBe(0)
    expect(screen.getByRole('tab', { name: 'Inspector' }).tabIndex).toBe(-1)
  })

  it('moves between tabs with the arrow, Home and End keys', () => {
    render(<LeftPanel />)
    const explore = screen.getByRole('tab', { name: 'Explore' })
    fireEvent.keyDown(explore, { key: 'ArrowRight' })
    const compare = screen.getByRole('tab', { name: 'Compare', selected: true })
    expect(document.activeElement).toBe(compare)
    fireEvent.keyDown(compare, { key: 'ArrowRight' })
    const inspector = screen.getByRole('tab', { name: 'Inspector', selected: true })
    expect(document.activeElement).toBe(inspector)
    fireEvent.keyDown(inspector, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Explore', selected: true })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Explore' }), { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Inspector', selected: true })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Inspector' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Explore', selected: true })).toBeTruthy()
  })

  it('has no Globe tab when the globe sits beside the panel', () => {
    render(<LeftPanel />)
    expect(screen.queryByRole('tab', { name: /Globe/ })).toBeNull()
  })

  describe('with the globe as a tab (phone width, #78)', () => {
    const globe = <div data-testid="globe">globe</div>

    it('adds a Globe tab and keeps the globe mounted while another tab shows', () => {
      render(<LeftPanel globe={globe} />)
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Explore', 'Globe', 'Compare', 'Inspector'])
      const wrapper = screen.getByTestId('globe').parentElement!
      expect(wrapper.hidden).toBe(true)

      fireEvent.click(screen.getByRole('tab', { name: 'Globe' }))
      expect(wrapper.hidden).toBe(false)
      expect(screen.queryByRole('region', { name: 'Graph' })).toBeNull()

      fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }))
      expect(screen.getByTestId('globe').parentElement!.hidden).toBe(true)
    })

    it('marks the Globe tab when the selection changes elsewhere, until the globe is opened', () => {
      render(<LeftPanel globe={globe} />)
      expect(screen.queryByLabelText('updated')).toBeNull()

      act(() => selectNode('nws-api'))
      expect(screen.getByLabelText('updated')).toBeTruthy()

      fireEvent.click(screen.getByRole('tab', { name: /Globe/ }))
      expect(screen.queryByLabelText('updated')).toBeNull()

      // A change made while looking at the globe (a globe click) is already seen on leaving it.
      act(() => selectNode('ndbc-realtime'))
      fireEvent.click(screen.getByRole('tab', { name: 'Explore' }))
      expect(screen.queryByLabelText('updated')).toBeNull()
    })
  })
})
