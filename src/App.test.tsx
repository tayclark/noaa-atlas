// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { mockNarrowLayout, unmockNarrowLayout } from './components/narrowLayoutTestUtils'
import { resetView } from './data/viewStore'

vi.mock('maplibre-gl', () => ({
  Map: class {
    on = vi.fn()
    setProjection = vi.fn()
    remove = vi.fn()
    addControl = vi.fn()
    touchZoomRotate = { disableRotation: vi.fn() }
    resize = vi.fn()
  },
  GeolocateControl: class {
    on = vi.fn()
  },
}))

beforeEach(resetView)

afterEach(() => {
  cleanup()
  unmockNarrowLayout()
})

describe('App', () => {
  it('renders the header, the left panel (Explore tab by default), and the globe', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'NOAA Atlas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Explore', selected: true })).toBeTruthy()
    expect(
      screen.getByRole('group', { name: 'Globe view of NOAA API coverage' }),
    ).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Resize panes' })).toBeTruthy()
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

    it('marks the compact layout and opens on Tasks, with no split and no globe loaded yet', () => {
      const { container } = render(<App />)
      expect(container.querySelector('.app')?.getAttribute('data-layout')).toBe('compact')
      expect(screen.getByRole('tab', { name: 'Tasks', selected: true })).toBeTruthy()
      expect(screen.queryByRole('separator')).toBeNull()
      expect(screen.queryByRole('group', { name: 'Globe view of NOAA API coverage' })).toBeNull()
    })

    it('shows the globe once its tab is opened', () => {
      render(<App />)
      fireEvent.click(screen.getByRole('tab', { name: 'Globe' }))
      expect(screen.getByRole('group', { name: 'Globe view of NOAA API coverage' })).toBeTruthy()
    })

    it('condenses the footer to a line, with the full disclaimer in the About dialog', () => {
      render(<App />)
      const footer = screen.getByRole('contentinfo')
      expect(footer.textContent).toContain('Not for emergencies')
      expect(footer.textContent).not.toContain('Not an official NOAA product')
      expect(screen.getByRole('link', { name: 'weather.gov' }).getAttribute('href')).toBe('https://www.weather.gov')

      const dialog = document.querySelector('dialog')!
      expect(dialog.hasAttribute('open')).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: 'About' }))
      expect(dialog.hasAttribute('open')).toBe(true)
      expect(dialog.textContent).toContain('Not an official NOAA product')
      expect(dialog.textContent).toContain('Not for emergency or life-safety')
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
