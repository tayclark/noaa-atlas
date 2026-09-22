// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('renders the header, the left panel (Inspector tab by default), and the globe', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'NOAA Atlas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Inspector', selected: true })).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Globe view of NOAA API coverage' }),
    ).toBeTruthy()
    expect(screen.getByRole('separator')).toBeTruthy()
  })

  it('switches to the Graph tab', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Graph' }))
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
  })
})
