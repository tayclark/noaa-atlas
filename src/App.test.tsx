// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

describe('App', () => {
  it('renders the header and both placeholder panes', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'NOAA Atlas' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Graph' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Globe' })).toBeTruthy()
    expect(screen.getByRole('separator')).toBeTruthy()
  })
})
