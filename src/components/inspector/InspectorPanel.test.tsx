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
    expect(screen.getByText('No live requests yet.')).toBeTruthy()
  })

  it('lists entries and shows the most recent one selected by default', () => {
    pushLogEntry(entry({ path: '/alerts/active' }))
    pushLogEntry(entry({ path: '/points/47.6,-122.3', url: 'https://api.weather.gov/points/47.6,-122.3' }))
    render(<InspectorPanel />)
    expect(screen.getByText('https://api.weather.gov/points/47.6,-122.3')).toBeTruthy()
  })

  it('selects a different entry on click', () => {
    pushLogEntry(entry({ id: 'a', path: '/alerts/active' }))
    pushLogEntry(entry({ id: 'b', path: '/points/47.6,-122.3', url: 'https://api.weather.gov/points/47.6,-122.3' }))
    render(<InspectorPanel />)
    fireEvent.click(screen.getByText('/alerts/active'))
    expect(screen.getByText('https://api.weather.gov/alerts/active')).toBeTruthy()
  })

  it('copies as curl and fetch', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    pushLogEntry(entry())
    render(<InspectorPanel />)

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
    expect(screen.getByText('offline')).toBeTruthy()
  })
})
