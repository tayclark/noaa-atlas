// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('maplibre-gl', () => ({
  Map: class {
    on = vi.fn()
    setProjection = vi.fn()
    remove = vi.fn()
    addControl = vi.fn()
  },
  GeolocateControl: class {
    on = vi.fn()
  },
}))

afterEach(cleanup)

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
})
