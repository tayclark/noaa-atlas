// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('maplibre-gl', () => ({
  Map: class {
    on = vi.fn()
    setProjection = vi.fn()
    remove = vi.fn()
  },
}))

afterEach(cleanup)

describe('App', () => {
  it('renders the header, the graph pane, and the globe', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'NOAA Atlas' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Globe view of NOAA API coverage' }),
    ).toBeTruthy()
    expect(screen.getByRole('separator')).toBeTruthy()
  })
})
