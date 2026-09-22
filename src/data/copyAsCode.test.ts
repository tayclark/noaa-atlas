import { describe, expect, it } from 'vitest'
import { toCurlCommand, toFetchSnippet } from './copyAsCode'
import type { RequestLogEntry } from './requestLog'

const sampleEntry: RequestLogEntry = {
  id: 'abc',
  method: 'GET',
  url: 'https://api.weather.gov/alerts/active',
  path: '/alerts/active',
  requestHeaders: { Accept: 'application/geo+json' },
  startedAt: Date.now(),
  durationMs: 12,
  status: 'success',
  httpStatus: 200,
}

describe('toCurlCommand', () => {
  it('builds a curl command with the request headers and URL', () => {
    expect(toCurlCommand(sampleEntry)).toBe(
      "curl -H 'Accept: application/geo+json' 'https://api.weather.gov/alerts/active'",
    )
  })
})

describe('toFetchSnippet', () => {
  it('builds a pasteable fetch() snippet with the request headers', () => {
    expect(toFetchSnippet(sampleEntry)).toBe(
      'fetch("https://api.weather.gov/alerts/active", {\n  headers: {\n    "Accept": "application/geo+json",\n  },\n})',
    )
  })
})
