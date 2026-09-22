import { describe, expect, it } from 'vitest'
import type { RequestLogEntry } from '../../data/requestLog'
import { formatTimestamp, statusColorClass, statusLabel, truncatePath } from './inspectorFormat'

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    id: 'abc',
    method: 'GET',
    url: 'https://api.weather.gov/alerts/active',
    path: '/alerts/active',
    requestHeaders: { Accept: 'application/geo+json' },
    startedAt: Date.now(),
    durationMs: 12,
    status: 'success',
    httpStatus: 200,
    ...overrides,
  }
}

describe('statusLabel', () => {
  it('labels a success entry with its HTTP status', () => {
    expect(statusLabel(entry({ status: 'success', httpStatus: 200 }))).toBe('200 OK')
  })

  it('labels an http-error entry', () => {
    expect(statusLabel(entry({ status: 'http-error', httpStatus: 429 }))).toBe('429 Error')
  })

  it('labels a parse-error entry', () => {
    expect(statusLabel(entry({ status: 'parse-error', httpStatus: 200 }))).toBe('200 Parse error')
  })

  it('labels a network-error entry', () => {
    expect(statusLabel(entry({ status: 'network-error', httpStatus: undefined }))).toBe('Network error')
  })
})

describe('statusColorClass', () => {
  it('marks success as ok and everything else as error', () => {
    expect(statusColorClass(entry({ status: 'success' }))).toBe('inspector-status-ok')
    expect(statusColorClass(entry({ status: 'http-error' }))).toBe('inspector-status-error')
    expect(statusColorClass(entry({ status: 'parse-error' }))).toBe('inspector-status-error')
    expect(statusColorClass(entry({ status: 'network-error' }))).toBe('inspector-status-error')
  })
})

describe('truncatePath', () => {
  it('leaves short paths untouched', () => {
    expect(truncatePath('/alerts/active', 40)).toBe('/alerts/active')
  })

  it('truncates long paths with an ellipsis', () => {
    const path = '/gridpoints/SEW/125,68/stations/very/long/extra/path'
    expect(truncatePath(path, 20)).toBe('/gridpoints/SEW/125…')
    expect(truncatePath(path, 20)).toHaveLength(20)
  })
})

describe('formatTimestamp', () => {
  it('renders a locale time string', () => {
    const ts = new Date('2026-01-01T12:00:00Z').getTime()
    expect(formatTimestamp(ts)).toBe(new Date(ts).toLocaleTimeString())
  })
})
