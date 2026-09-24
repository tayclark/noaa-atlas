// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InspectorPanel } from './InspectorPanel'
import { clearRequestLog, pushLogEntry, type RequestLogEntry } from '../../data/requestLog'

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    method: 'GET',
    url: 'https://api.weather.gov/alerts/active',
    path: '/alerts/active',
    requestHeaders: { Accept: 'application/geo+json' },
    startedAt: Date.now(),
    durationMs: 12,
    status: 'success',
    httpStatus: 200,
    responseBody: { type: 'FeatureCollection', features: [] },
    ...overrides,
  }
}

beforeEach(() => {
  clearRequestLog()
})

afterEach(cleanup)

describe('InspectorPanel', () => {
  it('shows an empty state with no requests', () => {
    render(<InspectorPanel />)
    expect(screen.getByText(/No live requests yet/)).toBeTruthy()
  })

  it('lists entries newest first, all collapsed, with a count', () => {
    pushLogEntry(entry({ path: '/alerts/active' }))
    pushLogEntry(entry({ path: '/points/47.6,-122.3', url: 'https://api.weather.gov/points/47.6,-122.3' }))
    render(<InspectorPanel />)
    const rows = screen.getAllByRole('button', { expanded: false })
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('/points/47.6,-122.3'),
      expect.stringContaining('/alerts/active'),
    ])
    expect(screen.getByText('2 requests, newest first')).toBeTruthy()
    expect(screen.queryByText('https://api.weather.gov/points/47.6,-122.3')).toBeNull()
  })

  it('expands a row in place and collapses it again (#150)', () => {
    pushLogEntry(entry({ id: 'a', path: '/alerts/active' }))
    pushLogEntry(entry({ id: 'b', path: '/points/47.6,-122.3', url: 'https://api.weather.gov/points/47.6,-122.3' }))
    render(<InspectorPanel />)

    const row = screen.getByRole('button', { name: /\/alerts\/active/ })
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('https://api.weather.gov/alerts/active')).toBeTruthy()
    expect(screen.queryByText('https://api.weather.gov/points/47.6,-122.3')).toBeNull()

    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('https://api.weather.gov/alerts/active')).toBeNull()
  })

  it('opens one row at a time', () => {
    pushLogEntry(entry({ id: 'a', path: '/alerts/active' }))
    pushLogEntry(entry({ id: 'b', path: '/points/47.6,-122.3', url: 'https://api.weather.gov/points/47.6,-122.3' }))
    render(<InspectorPanel />)
    fireEvent.click(screen.getByRole('button', { name: /\/alerts\/active/ }))
    fireEvent.click(screen.getByRole('button', { name: /\/points/ }))
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1)
    expect(screen.getByText('https://api.weather.gov/points/47.6,-122.3')).toBeTruthy()
  })

  it('folds the response body, with top-level keys visible and nested values collapsed', () => {
    pushLogEntry(entry({ responseBody: { type: 'FeatureCollection', features: [{ id: 'x' }, { id: 'y' }] } }))
    render(<InspectorPanel />)
    fireEvent.click(screen.getByRole('button', { name: /\/alerts\/active/ }))

    expect(screen.getByText('"FeatureCollection"')).toBeTruthy()
    expect(screen.getByText('[…] 2 items')).toBeTruthy()
    expect(screen.queryByText('"x"')).toBeNull()

    const features = screen.getByText('[…] 2 items').closest('details') as HTMLDetailsElement
    features.open = true
    fireEvent(features, new Event('toggle'))
    expect(screen.getAllByText('{…} 1 key')).toHaveLength(2)
  })

  it('pages a long array behind a "Show more" button', () => {
    pushLogEntry(entry({ responseBody: Array.from({ length: 25 }, (_, i) => `item-${i}`) }))
    render(<InspectorPanel />)
    fireEvent.click(screen.getByRole('button', { name: /\/alerts\/active/ }))

    expect(screen.getByText('"item-19"')).toBeTruthy()
    expect(screen.queryByText('"item-20"')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more of 5' }))
    expect(screen.getByText('"item-24"')).toBeTruthy()
  })

  it('keeps request headers folded until asked', () => {
    pushLogEntry(entry())
    render(<InspectorPanel />)
    fireEvent.click(screen.getByRole('button', { name: /\/alerts\/active/ }))
    const headers = screen.getByText('Request headers (1)').closest('details') as HTMLDetailsElement
    expect(headers.open).toBe(false)
  })

  it('clears the log', () => {
    pushLogEntry(entry())
    render(<InspectorPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText(/No live requests yet/)).toBeTruthy()
  })

  it('copies as curl and fetch', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    pushLogEntry(entry())
    render(<InspectorPanel />)
    fireEvent.click(screen.getByRole('button', { name: /\/alerts\/active/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Copy as curl' }))
    expect(writeText).toHaveBeenCalledWith(
      "curl -H 'Accept: application/geo+json' 'https://api.weather.gov/alerts/active'",
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy as fetch' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('fetch('))
    vi.unstubAllGlobals()
  })

  it('shows the error message instead of a body for failed calls', () => {
    pushLogEntry(
      entry({
        status: 'network-error',
        httpStatus: undefined,
        responseBody: undefined,
        errorMessage: 'offline',
      }),
    )
    render(<InspectorPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Network error/ }))
    expect(screen.getByText('offline')).toBeTruthy()
  })
})
