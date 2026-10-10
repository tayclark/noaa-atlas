// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { mockNarrowLayout, unmockNarrowLayout } from './components/narrowLayoutTestUtils'
import { clearSelection, getSelectionSnapshot, selectNode } from './data/selectionStore'
import { resetView } from './data/viewStore'

vi.mock('maplibre-gl', () => ({
  Map: class {
    on = vi.fn()
    setProjection = vi.fn()
    remove = vi.fn()
    addControl = vi.fn()
    touchZoomRotate = { disableRotation: vi.fn() }
    resize = vi.fn()
    canvas = document.createElement('canvas')
    getCanvas = () => this.canvas
  },
  GeolocateControl: class {
    on = vi.fn()
  },
}))

// The globe is a lazy chunk (#264). Importing it once up front means a render's lazy import
// resolves from the module cache: a test that waited for the first transform could pass the
// 5 s test timeout on CI, and the graph's simulation would tick into d3-zoom, which jsdom can't run.
beforeAll(() => import('./components/globe/MapLibreGlobe'), 60_000)

beforeEach(resetView)

afterEach(() => {
  cleanup()
  unmockNarrowLayout()
  clearSelection()
})

describe('Escape (#267)', () => {
  it('clears the selection from anywhere but a field', () => {
    render(<App />)
    selectNode('nws-api')
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(getSelectionSnapshot().selectedNodeId).toBe('nws-api')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(getSelectionSnapshot().selectedNodeId).toBeNull()
  })
})

describe('App', () => {
  it('renders the header, the left panel (Explore tab by default), and the globe', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'NOAA Atlas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Explore', selected: true })).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Resize panes' })).toBeTruthy()
    // The globe is a lazy chunk (#264); its loading placeholder is covered by e2e/globe-lazy.spec.ts.
    expect(await screen.findByRole('group', { name: 'Globe view of NOAA API coverage' })).toBeTruthy()
  })

  it('shows the graph alongside the finder on the default tab', () => {
    render(<App />)
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
  })

  it('shows the NOAA disclaimer and a link to the data terms in the footer', () => {
    render(<App />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.textContent).toContain('Not an official NOAA product')
    expect(screen.getByRole('link', { name: 'Data terms' }).getAttribute('href')).toContain('#data-terms-and-attribution')
  })

  it('marks the wide layout for the stylesheets, with no About dialog', () => {
    const { container } = render(<App />)
    expect(container.querySelector('.app')?.getAttribute('data-layout')).toBe('wide')
    expect(screen.queryByRole('button', { name: 'About this data' })).toBeNull()
  })

  describe('compact layout (a phone, #78)', () => {
    beforeEach(() => {
      mockNarrowLayout(true)
    })

    it('marks the compact layout and opens on Graph, with no split and no globe loaded yet', () => {
      const { container } = render(<App />)
      expect(container.querySelector('.app')?.getAttribute('data-layout')).toBe('compact')
      expect(screen.getByRole('tab', { name: 'Graph', selected: true })).toBeTruthy()
      expect(screen.queryByRole('separator')).toBeNull()
      expect(screen.queryByRole('group', { name: 'Globe view of NOAA API coverage' })).toBeNull()
      expect(screen.queryByRole('status', { name: 'Map status' })).toBeNull()
    })

    it('shows the globe once its tab is opened', async () => {
      render(<App />)
      fireEvent.click(screen.getByRole('tab', { name: 'Globe' }))
      expect(await screen.findByRole('group', { name: 'Globe view of NOAA API coverage' })).toBeTruthy()
    })

    it('condenses the footer to a line, with the full disclaimer in the About dialog', () => {
      render(<App />)
      const footer = screen.getByRole('contentinfo')
      expect(footer.textContent).toContain('Not for emergencies')
      expect(footer.textContent).not.toContain('Not an official NOAA product')
      expect(footer.querySelector('a')).toBeNull()

      const dialog = document.querySelector('dialog')!
      expect(dialog.hasAttribute('open')).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'About' }))
      expect(dialog.hasAttribute('open')).toBe(true)
      expect(dialog.textContent).toContain('Not an official NOAA product')
      expect(dialog.textContent).toContain('Not for emergency or life-safety')
      expect(dialog.querySelector('a[href="https://www.weather.gov"]')).not.toBeNull()
      expect(screen.getAllByRole('link', { name: 'Data terms' })[0]?.getAttribute('href')).toContain('#data-terms-and-attribution')

      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(dialog.hasAttribute('open')).toBe(false)
    })

    it('opens the same dialog from the header', () => {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'About this data' }))
      expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(true)
    })
  })
})
