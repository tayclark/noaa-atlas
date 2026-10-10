import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHE_MAX_ENTRIES, createLiveClient } from './liveRequest'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'
import { jsonResponse } from '../test/http'

class TestHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Test request failed (${status}).`)
    this.status = status
  }
}

class TestParseError extends Error {
  readonly cause: unknown

  constructor(path: string, cause: unknown) {
    super(`Test response for ${path} did not match the expected shape`)
    this.cause = cause
  }
}

const BASE = 'https://example.test'

function makeClient() {
  return createLiveClient({
    baseUrl: BASE,
    headers: { Accept: 'application/json' },
    httpError: (res) => new TestHttpError(res.status),
    parseError: (path, cause) => new TestParseError(path, cause),
  })
}

/** Accepts `{ ok: true }` and nothing else. */
function parseOk(raw: unknown): { ok: true } {
  if (typeof raw === 'object' && raw !== null && (raw as { ok?: unknown }).ok === true) return { ok: true }
  throw new Error('not ok')
}

let client = makeClient()

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  client = makeClient()
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createLiveClient', () => {
  it('fetches baseUrl + path with the client headers, and logs the success with the body and its size', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))
    expect(await client.request('/a', parseOk)).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledWith(`${BASE}/a`, expect.objectContaining({ headers: { Accept: 'application/json' } }))
    expect(getRequestLogSnapshot()[0]).toMatchObject({
      method: 'GET',
      url: `${BASE}/a`,
      path: '/a',
      requestHeaders: { Accept: 'application/json' },
      status: 'success',
      httpStatus: 200,
      responseBody: { ok: true },
      responseSize: JSON.stringify({ ok: true }).length,
    })
  })

  it('throws the client http error for a non-2xx response and logs it', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }))
    await expect(client.request('/a', parseOk)).rejects.toMatchObject({ status: 503 })
    expect(getRequestLogSnapshot()[0]).toMatchObject({ status: 'http-error', httpStatus: 503 })
  })

  it('logs a network failure and rethrows it', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(client.request('/a', parseOk)).rejects.toBeInstanceOf(TypeError)
    expect(getRequestLogSnapshot()[0]).toMatchObject({ status: 'network-error', errorMessage: 'Failed to fetch' })
  })

  it('throws the client parse error for a body that fails the schema, logging the body', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: false }))
    const err = await client.request('/a', parseOk).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TestParseError)
    expect((err as TestParseError).message).toBe('Test response for /a did not match the expected shape')
    expect(getRequestLogSnapshot()[0]).toMatchObject({ status: 'parse-error', httpStatus: 200, responseBody: { ok: false } })
  })

  it('throws the client parse error for a 200 that is not JSON, and logs it as a parse error', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>Service Unavailable</html>', { status: 200 }))
    const err = await client.request('/a', parseOk).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TestParseError)
    expect((err as TestParseError).cause).toBeInstanceOf(SyntaxError)
    const [entry] = getRequestLogSnapshot()
    expect(entry).toMatchObject({ status: 'parse-error', httpStatus: 200, responseSize: 32 })
    expect(entry.errorMessage).toBeTruthy()
  })

  it('caches a success for 60 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    await client.request('/a', parseOk)
    await client.request('/a', parseOk)
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 60_001)
    await client.request('/a', parseOk)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('drops expired entries when it stores a new one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    await client.request('/a', parseOk)
    await client.request('/b', parseOk)
    vi.setSystemTime(Date.now() + 60_001)
    await client.request('/c', parseOk)
    expect(client.cacheSize()).toBe(1)
  })

  it('keeps at most CACHE_MAX_ENTRIES responses, dropping the oldest', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    for (let i = 0; i <= CACHE_MAX_ENTRIES; i++) await client.request(`/${i}`, parseOk)
    expect(client.cacheSize()).toBe(CACHE_MAX_ENTRIES)
    vi.mocked(fetch).mockClear()
    await client.request(`/${CACHE_MAX_ENTRIES}`, parseOk)
    expect(fetch).not.toHaveBeenCalled()
    await client.request('/0', parseOk)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect(client.request('/a', parseOk)).rejects.toBeInstanceOf(TestHttpError)
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))
    expect(await client.request('/a', parseOk)).toEqual({ ok: true })
  })

  it('shares one fetch between identical concurrent requests', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    const [a, b] = await Promise.all([client.request('/a', parseOk), client.request('/a', parseOk)])
    expect(a).toBe(b)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(getRequestLogSnapshot()).toHaveLength(1)
  })

  it('shares a failure with every waiting caller, then retries on the next request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 502 }))
    const results = await Promise.allSettled([client.request('/a', parseOk), client.request('/a', parseOk)])
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))
    expect(await client.request('/a', parseOk)).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not share a fetch between different URLs', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    await Promise.all([client.request('/a', parseOk), client.request('/b', parseOk)])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('forgets its cache on clearCache', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))
    await client.request('/a', parseOk)
    client.clearCache()
    await client.request('/a', parseOk)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
