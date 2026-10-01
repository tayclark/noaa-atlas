// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LeftPanel } from './LeftPanel'
import { mockNarrowLayout, unmockNarrowLayout } from './narrowLayoutTestUtils'
import { addCompare, clearCompare } from '../data/compareStore'
import { clearRequestLog, pushLogEntry } from '../data/requestLog'
import { clearSelection, selectNode } from '../data/selectionStore'
import { resetView, showView } from '../data/viewStore'

beforeEach(() => {
  clearRequestLog()
  clearSelection()
  clearCompare()
  resetView()
})

afterEach(() => {
  cleanup()
  unmockNarrowLayout()
})

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

  it('keeps Explore mounted, so the graph is not rebuilt, while another tab shows', () => {
    render(<LeftPanel />)
    const graph = screen.getByRole('region', { name: 'Graph' })
    fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }))
    expect(screen.queryByRole('region', { name: 'Graph' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Explore' }))
    expect(screen.getByRole('region', { name: 'Graph' })).toBe(graph)
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

  it('wires each tab to its own panel and keeps only the active tab in the Tab order', () => {
    render(<LeftPanel />)
    const explore = screen.getByRole('tab', { name: 'Explore' })
    const panel = screen.getByRole('tabpanel')
    expect(explore.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(explore.id)
    expect(explore.tabIndex).toBe(0)
    expect(screen.getByRole('tab', { name: 'Inspector' }).tabIndex).toBe(-1)
    // The panels of the other tabs exist, hidden, so a tab's aria-controls always points somewhere.
    const inspector = screen.getByRole('tab', { name: 'Inspector' })
    expect(document.getElementById(inspector.getAttribute('aria-controls') ?? '')?.hidden).toBe(true)
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

  it('shows a selected node on the floating card, never the phone sheet', () => {
    render(<LeftPanel />)
    act(() => selectNode('nws-api'))
    expect(document.querySelector('.node-detail-panel')).not.toBeNull()
    expect(document.querySelector('.detail-sheet')).toBeNull()
  })

  it('folds a request for the phone-only views back into Explore on a wide screen', () => {
    showView('graph')
    render(<LeftPanel />)
    expect(screen.getByRole('tab', { name: 'Explore', selected: true })).toBeTruthy()
  })

  describe('compact layout (a phone, #78)', () => {
    const globe = <div data-testid="globe">globe</div>

    beforeEach(() => {
      mockNarrowLayout(true)
    })

    it('splits Explore into Tasks and Graph and adds a Globe tab', () => {
      render(<LeftPanel globe={globe} />)
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Tasks', 'Graph', 'Globe', 'Compare', 'Inspector'])
      expect(screen.getByRole('tab', { name: 'Tasks', selected: true })).toBeTruthy()
      expect(screen.getByText("Get today's local forecast")).toBeTruthy()
    })

    it('mounts the graph and the globe when first opened, then keeps them while another tab shows', () => {
      render(<LeftPanel globe={globe} />)
      expect(screen.queryByRole('region', { name: 'Graph', hidden: true })).toBeNull()
      expect(screen.queryByTestId('globe')).toBeNull()

      fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))
      expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
      expect(screen.queryByTestId('globe')).toBeNull()

      fireEvent.click(screen.getByRole('tab', { name: 'Globe' }))
      const panel = screen.getByTestId('globe').closest<HTMLElement>('[role="tabpanel"]')!
      expect(panel.hidden).toBe(false)
      expect(screen.queryByRole('region', { name: 'Graph' })).toBeNull()

      fireEvent.click(screen.getByRole('tab', { name: 'Inspector' }))
      expect(screen.getByTestId('globe').closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(true)
      expect(screen.getByRole('region', { name: 'Graph', hidden: true })).toBeTruthy()
    })

    it('marks Graph and Globe when the selection changes elsewhere, until each is opened', () => {
      render(<LeftPanel globe={globe} />)
      expect(screen.queryByLabelText('updated')).toBeNull()

      act(() => selectNode('nws-api'))
      expect(screen.getAllByLabelText('updated')).toHaveLength(2)

      fireEvent.click(screen.getByRole('tab', { name: /Graph/ }))
      expect(screen.getAllByLabelText('updated')).toHaveLength(1)
      fireEvent.click(screen.getByRole('tab', { name: /Globe/ }))
      expect(screen.queryByLabelText('updated')).toBeNull()

      // A change made while looking at the globe (a globe click) is already seen on leaving it, but
      // the graph hasn't seen it.
      act(() => selectNode('ndbc-realtime'))
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getAllByLabelText('updated')).toHaveLength(1)
      fireEvent.click(screen.getByRole('tab', { name: /Graph/ }))
      expect(screen.queryByLabelText('updated')).toBeNull()
    })

    it('moves through all five tabs with Home and End', () => {
      render(<LeftPanel globe={globe} />)
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Tasks' }), { key: 'End' })
      expect(screen.getByRole('tab', { name: 'Inspector', selected: true })).toBeTruthy()
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Inspector' }), { key: 'ArrowLeft' })
      expect(screen.getByRole('tab', { name: 'Compare', selected: true })).toBeTruthy()
      fireEvent.keyDown(screen.getByRole('tab', { name: 'Compare' }), { key: 'Home' })
      expect(screen.getByRole('tab', { name: 'Tasks', selected: true })).toBeTruthy()
    })

    it('shows the selected node as a bottom sheet on Tasks and Graph, and nowhere else', () => {
      render(<LeftPanel globe={globe} />)
      expect(screen.queryByLabelText('Node detail')).toBeNull()

      act(() => selectNode('nws-api'))
      expect(screen.getByLabelText('Node detail').classList.contains('detail-sheet')).toBe(true)
      fireEvent.click(screen.getByRole('tab', { name: /Graph/ }))
      expect(screen.getByLabelText('Node detail').classList.contains('detail-sheet')).toBe(true)
      fireEvent.click(screen.getByRole('tab', { name: /Globe/ }))
      expect(screen.queryByLabelText('Node detail')).toBeNull()
      fireEvent.click(screen.getByRole('tab', { name: 'Compare' }))
      expect(screen.queryByLabelText('Node detail')).toBeNull()
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByLabelText('Node detail')).toBeTruthy()
    })

    it('opens the sheet for a step picked on Tasks, but only peeks on Graph', () => {
      render(<LeftPanel globe={globe} />)
      act(() => selectNode('nws-api'))
      expect(screen.getByRole('button', { name: 'Collapse details' })).toBeTruthy()

      fireEvent.click(screen.getByRole('tab', { name: /Graph/ }))
      expect(screen.getByRole('button', { name: 'Expand details' })).toBeTruthy()

      act(() => clearSelection())
      expect(screen.queryByLabelText('Node detail')).toBeNull()
      act(() => selectNode('coops-data-api'))
      expect(screen.getByRole('button', { name: 'Expand details' })).toBeTruthy()
    })

    it('can be sent to a view from outside, as a Show on globe button will', () => {
      render(<LeftPanel globe={globe} />)
      act(() => showView('globe'))
      expect(screen.getByRole('tab', { name: 'Globe', selected: true })).toBeTruthy()
    })
  })
})
