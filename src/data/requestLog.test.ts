import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRequestLog, getRequestLogSnapshot, pushLogEntry, subscribeRequestLog } from './requestLog'

function entry(overrides: Partial<Parameters<typeof pushLogEntry>[0]> = {}) {
  return {
    id: crypto.randomUUID(),
    method: 'GET' as const,
    url: 'https://api.weather.gov/alerts/active',
    path: '/alerts/active',
    requestHeaders: { Accept: 'application/geo+json' },
    startedAt: Date.now(),
    durationMs: 10,
    status: 'success' as const,
    ...overrides,
  }
}

beforeEach(() => {
  clearRequestLog()
})

describe('pushLogEntry', () => {
  it('adds entries newest-first', () => {
    pushLogEntry(entry({ path: '/first' }))
    pushLogEntry(entry({ path: '/second' }))
    const snapshot = getRequestLogSnapshot()
    expect(snapshot[0].path).toBe('/second')
    expect(snapshot[1].path).toBe('/first')
  })

  it('caps the log at 50 entries, dropping the oldest', () => {
    for (let i = 0; i < 55; i++) {
      pushLogEntry(entry({ path: `/entry-${i}` }))
    }
    const snapshot = getRequestLogSnapshot()
    expect(snapshot).toHaveLength(50)
    expect(snapshot[0].path).toBe('/entry-54')
    expect(snapshot.at(-1)?.path).toBe('/entry-5')
  })

  it('notifies subscribers on push and clear', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeRequestLog(listener)
    pushLogEntry(entry())
    expect(listener).toHaveBeenCalledTimes(1)
    clearRequestLog()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    pushLogEntry(entry())
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('getRequestLogSnapshot', () => {
  it('returns a stable reference when nothing has changed', () => {
    pushLogEntry(entry())
    expect(getRequestLogSnapshot()).toBe(getRequestLogSnapshot())
  })
})
