// The fetch → validate → cache → log core shared by every live client (#54): NWS, SWPC, CO-OPS, SPC,
// NHC, ArcGIS, NCEI and the GFS bucket. Each client makes its own instance, so it keeps its own cache
// and error types, while every call still lands in requestLog.ts for the Inspector tab.

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

export interface RequestOptions {
  /**
   * Cancels this call. A call with a signal makes its own fetch: it neither joins an identical call
   * already in flight nor lets later ones join it, so aborting it can't fail anyone else's request.
   * It still caches a success. An abort rejects with the fetch's AbortError and isn't logged.
   */
  signal?: AbortSignal
}

export type RawBodyKind = 'text' | 'arrayBuffer'
export type RawBody<K extends RawBodyKind> = K extends 'text' ? string : ArrayBuffer

export interface RawRequestOptions<K extends RawBodyKind> extends RequestOptions {
  /** How to read the body. */
  as: K
  /** Headers for this call on top of the client's, such as a Range. */
  headers?: Record<string, string>
  /** What the Inspector shows as the body, such as a summary of bytes it can't display. Nothing by default. */
  logBody?: (body: RawBody<K>) => unknown
}

export interface LiveClient {
  request: <T>(path: string, parse: (raw: unknown) => T, options?: RequestOptions) => Promise<T>
  /**
   * Fetches and logs a body as text or bytes, unparsed. It isn't cached or shared between callers,
   * so a caller that wants either keeps its own (gfsClient.ts caches its decoded fields).
   */
  requestRaw: <K extends RawBodyKind>(path: string, options: RawRequestOptions<K>) => Promise<RawBody<K>>
  /** Forgets the cached response for one path, so the next request for it goes to the network. */
  invalidate: (path: string) => void
  /** Clears this client's in-memory response cache. Intended for test isolation between cases. */
  clearCache: () => void
  /** How many responses the cache holds. For tests. */
  cacheSize: () => number
}

type LogExtra = { httpStatus?: number; responseBody?: unknown; responseSize?: number; errorMessage?: string }
type Log = (status: RequestLogStatus, extra?: LogExtra) => void

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

  /** Starts one call's log: each entry it writes carries the URL, the headers sent and the time taken. */
  function startLog(url: string, path: string, requestHeaders: Record<string, string>): Log {
    const startedAt = Date.now()
    const startedAtPerf = performance.now()
    return (status, extra = {}) =>
      pushLogEntry({
        id: crypto.randomUUID(),
        method: 'GET',
        url,
        path,
        requestHeaders,
        startedAt,
        durationMs: performance.now() - startedAtPerf,
        status,
        ...extra,
      })
  }

  /** Fetches and checks the status, logging a failure. An abort is rethrown without a log entry. */
  async function send(url: string, requestHeaders: Record<string, string>, log: Log, signal?: AbortSignal): Promise<Response> {
    let res: Response
    try {
      res = await fetch(url, signal ? { headers: requestHeaders, signal } : { headers: requestHeaders })
    } catch (err) {
      if (signal?.aborted) throw err
      log('network-error', { errorMessage: err instanceof Error ? err.message : 'Network request failed' })
      throw err
    }
    if (!res.ok) {
      log('http-error', { httpStatus: res.status })
      throw httpError(res)
    }
    return res
  }

  /** Reads the body. One that breaks off mid-read is logged as a network failure. */
  async function readBody<B>(res: Response, read: (res: Response) => Promise<B>, log: Log, signal?: AbortSignal): Promise<B> {
    try {
      return await read(res)
    } catch (err) {
      if (signal?.aborted) throw err
      log('network-error', { httpStatus: res.status, errorMessage: err instanceof Error ? err.message : 'Response body could not be read' })
      throw err
    }
  }

  function request<T>(path: string, parse: (raw: unknown) => T, { signal }: RequestOptions = {}): Promise<T> {
    const url = `${baseUrl}${path}`
    const cached = cache.get(url)
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T)
    if (signal) return load(url, path, parse, signal)

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

  async function load<T>(url: string, path: string, parse: (raw: unknown) => T, signal?: AbortSignal): Promise<T> {
    const log = startLog(url, path, headers)
    const res = await send(url, headers, log, signal)
    // Read as text so the log knows the body's size (#265). One that isn't JSON (an HTML error page
    // sent as a 200) is a parse error.
    const text = await readBody(res, (r) => r.text(), log, signal)
    let raw: unknown
    try {
      raw = decode(text)
    } catch (err) {
      log('parse-error', {
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
      log('parse-error', { httpStatus: res.status, responseBody: raw, responseSize: text.length })
      throw parseError(path, err)
    }

    log('success', { httpStatus: res.status, responseBody: raw, responseSize: text.length })
    remember(url, value)
    return value
  }

  async function requestRaw<K extends RawBodyKind>(path: string, { as, headers: extra, signal, logBody }: RawRequestOptions<K>): Promise<RawBody<K>> {
    const url = `${baseUrl}${path}`
    const requestHeaders = extra ? { ...headers, ...extra } : headers
    const log = startLog(url, path, requestHeaders)
    const res = await send(url, requestHeaders, log, signal)
    const body = (await readBody<string | ArrayBuffer>(res, (r) => (as === 'text' ? r.text() : r.arrayBuffer()), log, signal)) as RawBody<K>
    const responseSize = typeof body === 'string' ? body.length : (body as ArrayBuffer).byteLength
    log('success', { httpStatus: res.status, responseBody: logBody?.(body), responseSize })
    return body
  }

  function clearCache(): void {
    cache.clear()
    inFlight.clear()
  }

  return { request, requestRaw, invalidate: (path) => cache.delete(`${baseUrl}${path}`), clearCache, cacheSize: () => cache.size }
}
