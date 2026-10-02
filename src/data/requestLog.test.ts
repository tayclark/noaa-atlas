import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BODY_BUDGET, clearRequestLog, getRequestLogSnapshot, pushLogEntry, subscribeRequestLog, trimBodies } from './requestLog'

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

describe('response body retention (#265)', () => {
  const body = { type: 'FeatureCollection', features: [] }

  it('keeps a body only on the newest entry for each URL', () => {
    pushLogEntry(entry({ path: '/old', responseBody: body, responseSize: 10 }))
    pushLogEntry(entry({ path: '/new', responseBody: body, responseSize: 10 }))
    const [newest, older] = getRequestLogSnapshot()
    expect(newest?.responseBody).toEqual(body)
    expect(newest?.bodyOmitted).toBeUndefined()
    expect(older?.responseBody).toBeUndefined()
    expect(older?.bodyOmitted).toBe('superseded')
    expect(older?.path).toBe('/old')
  })

  it('keeps bodies for different URLs', () => {
    pushLogEntry(entry({ url: 'https://a.example/1', responseBody: body, responseSize: 10 }))
    pushLogEntry(entry({ url: 'https://a.example/2', responseBody: body, responseSize: 10 }))
    expect(getRequestLogSnapshot().every((e) => e.responseBody !== undefined)).toBe(true)
  })

  it('drops the oldest bodies once the kept text passes the budget', () => {
    const log = [
      entry({ url: 'https://a.example/3', responseBody: body, responseSize: 40 }),
      entry({ url: 'https://a.example/2', responseBody: body, responseSize: 40 }),
      entry({ url: 'https://a.example/1', responseBody: body, responseSize: 40 }),
    ]
    const trimmed = trimBodies(log, 100)
    expect(trimmed.map((e) => e.bodyOmitted)).toEqual([undefined, undefined, 'over-budget'])
    expect(trimmed[2]?.responseBody).toBeUndefined()
  })

  it('keeps the newest body even when it alone is over the budget', () => {
    pushLogEntry(entry({ url: 'https://a.example/old', responseBody: body, responseSize: 1 }))
    pushLogEntry(entry({ url: 'https://a.example/huge', responseBody: body, responseSize: BODY_BUDGET + 1 }))
    const [newest, older] = getRequestLogSnapshot()
    expect(newest?.responseBody).toEqual(body)
    expect(older?.bodyOmitted).toBe('over-budget')
  })

  it('leaves entries without a body, and their identity, alone', () => {
    const failed = entry({ status: 'network-error', errorMessage: 'offline' })
    const kept = entry({ url: 'https://a.example/kept', responseBody: body, responseSize: 1 })
    const trimmed = trimBodies([kept, failed])
    expect(trimmed[0]).toBe(kept)
    expect(trimmed[1]).toBe(failed)
  })

  it('does not mutate the entries it trims', () => {
    const older = entry({ responseBody: body, responseSize: 1 })
    trimBodies([entry({ responseBody: body, responseSize: 1 }), older])
    expect(older.responseBody).toEqual(body)
  })
})
