// The fetch → validate → cache → log core shared by the live clients (nwsClient.ts, swpcClient.ts;
// #54). Each client makes its own instance, so it keeps its own cache and error types, while every
// call still lands in requestLog.ts for the Inspector tab.

import { pushLogEntry, type RequestLogStatus } from './requestLog'

const CACHE_TTL_MS = 60_000

export interface LiveClientOptions {
  baseUrl: string
  headers: Record<string, string>
  /** Builds the error thrown for a non-2xx response. */
  httpError: (res: Response) => Error
  /** Builds the error thrown when the response doesn't match its schema. */
  parseError: (path: string, cause: unknown) => Error
}

export interface LiveClient {
  request: <T>(path: string, parse: (raw: unknown) => T) => Promise<T>
  /** Clears this client's in-memory response cache. Intended for test isolation between cases. */
  clearCache: () => void
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

export function createLiveClient({ baseUrl, headers, httpError, parseError }: LiveClientOptions): LiveClient {
  const cache = new Map<string, CacheEntry>()

  function logRequest(
    url: string,
    path: string,
    startedAt: number,
    startedAtPerf: number,
    status: RequestLogStatus,
    extra: { httpStatus?: number; responseBody?: unknown; errorMessage?: string } = {},
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

  async function request<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
    const url = `${baseUrl}${path}`
    const cached = cache.get(url)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T
    }

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

    const raw: unknown = await res.json()
    let value: T
    try {
      value = parse(raw)
    } catch (err) {
      logRequest(url, path, startedAt, startedAtPerf, 'parse-error', { httpStatus: res.status, responseBody: raw })
      throw parseError(path, err)
    }

    logRequest(url, path, startedAt, startedAtPerf, 'success', { httpStatus: res.status, responseBody: raw })
    cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS })
    return value
  }

  return { request, clearCache: () => cache.clear() }
}
