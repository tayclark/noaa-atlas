// The fetch → validate → cache → log core shared by the live clients (nwsClient.ts, swpcClient.ts;
// #54). Each client makes its own instance, so it keeps its own cache and error types, while every
// call still lands in requestLog.ts for the Inspector tab.

import { pushLogEntry, type RequestLogStatus } from './requestLog'

const CACHE_TTL_MS = 60_000
/** The most responses one client keeps; past it the oldest go first. */
export const CACHE_MAX_ENTRIES = 100

export interface LiveClientOptions {
  baseUrl: string
  headers: Record<string, string>
  /** Builds the error thrown for a non-2xx response. */
  httpError: (res: Response) => Error
  /** Builds the error thrown when the response doesn't match its schema. */
  parseError: (path: string, cause: unknown) => Error
  /** Turns the body text into the value `parse` validates and the Inspector shows; JSON by default (#242). */
  decode?: (text: string) => unknown
}

export interface LiveClient {
  request: <T>(path: string, parse: (raw: unknown) => T) => Promise<T>
  /** Clears this client's in-memory response cache. Intended for test isolation between cases. */
  clearCache: () => void
  /** How many responses the cache holds. For tests. */
  cacheSize: () => number
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

export function createLiveClient({ baseUrl, headers, httpError, parseError, decode = JSON.parse }: LiveClientOptions): LiveClient {
  const cache = new Map<string, CacheEntry>()
  const inFlight = new Map<string, Promise<unknown>>()

  /** Stores a response, dropping every expired one and then the oldest past the cap. */
  function remember(url: string, value: unknown): void {
    const now = Date.now()
    for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key)
    // Re-inserting moves the URL to the back of the Map's insertion order, which is its age.
    cache.delete(url)
    cache.set(url, { value, expiresAt: now + CACHE_TTL_MS })
    while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  }

  function logRequest(
    url: string,
    path: string,
    startedAt: number,
    startedAtPerf: number,
    status: RequestLogStatus,
    extra: { httpStatus?: number; responseBody?: unknown; responseSize?: number; errorMessage?: string } = {},
  ): void {
    pushLogEntry({
      id: crypto.randomUUID(),
      method: 'GET',
      url,
      path,
      requestHeaders: headers,
      startedAt,
      durationMs: performance.now() - startedAtPerf,
      status,
      ...extra,
    })
  }

  function request<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
    const url = `${baseUrl}${path}`
    const cached = cache.get(url)
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T)

    // Callers asking for the same URL at once (a point select reads the point twice) share one
    // fetch. It is forgotten when it settles, so a failure is not remembered.
    const shared = inFlight.get(url)
    if (shared) return shared as Promise<T>
    const pending = load(url, path, parse)
    inFlight.set(url, pending)
    const forget = () => {
      if (inFlight.get(url) === pending) inFlight.delete(url)
    }
    pending.then(forget, forget)
    return pending
  }

  async function load<T>(url: string, path: string, parse: (raw: unknown) => T): Promise<T> {
    const startedAt = Date.now()
    const startedAtPerf = performance.now()
    let res: Response
    try {
      res = await fetch(url, { headers })
    } catch (err) {
      logRequest(url, path, startedAt, startedAtPerf, 'network-error', {
        errorMessage: err instanceof Error ? err.message : 'Network request failed',
      })
      throw err
    }

    if (!res.ok) {
      logRequest(url, path, startedAt, startedAtPerf, 'http-error', { httpStatus: res.status })
      throw httpError(res)
    }

    // Read as text so the log knows the body's size (#265). A body that breaks off mid-read is a
    // network failure; one that isn't JSON (an HTML error page sent as a 200) is a parse error.
    let text: string
    try {
      text = await res.text()
    } catch (err) {
      logRequest(url, path, startedAt, startedAtPerf, 'network-error', {
        httpStatus: res.status,
        errorMessage: err instanceof Error ? err.message : 'Response body could not be read',
      })
      throw err
    }
    let raw: unknown
    try {
      raw = decode(text)
    } catch (err) {
      logRequest(url, path, startedAt, startedAtPerf, 'parse-error', {
        httpStatus: res.status,
        responseSize: text.length,
        errorMessage: err instanceof Error ? err.message : 'Response could not be decoded',
      })
      throw parseError(path, err)
    }
    let value: T
    try {
      value = parse(raw)
    } catch (err) {
      logRequest(url, path, startedAt, startedAtPerf, 'parse-error', { httpStatus: res.status, responseBody: raw, responseSize: text.length })
      throw parseError(path, err)
    }

    logRequest(url, path, startedAt, startedAtPerf, 'success', { httpStatus: res.status, responseBody: raw, responseSize: text.length })
    remember(url, value)
    return value
  }

  function clearCache(): void {
    cache.clear()
    inFlight.clear()
  }

  return { request, clearCache, cacheSize: () => cache.size }
}
