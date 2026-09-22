// Typed wrapper around api.weather.gov (see the nws-api node in graph.json and
// https://www.weather.gov/documentation/services-web-api for the source docs).
//
// Header note: NWS's docs ask for a descriptive User-Agent identifying the app and a contact
// method. This client runs entirely in the browser (no server/proxy in this repo — see
// backlog #72), and `fetch()` treats `User-Agent` as a forbidden header that browsers silently
// drop, so it cannot be set here. We send the `Accept` header NWS also documents instead of
// pretending to comply with the User-Agent guidance.

import {
  parseAlertCollection,
  parseGridpointForecast,
  parsePoint,
  parseStationCollection,
  type NwsAlertCollection,
  type NwsGridpointForecast,
  type NwsPoint,
  type NwsStationCollection,
} from './nwsSchema'

const NWS_BASE_URL = 'https://api.weather.gov'
const CACHE_TTL_MS = 60_000

export class NwsHttpError extends Error {
  readonly status: number
  readonly kind: 'forbidden' | 'rate-limited' | 'server-error' | 'unknown'

  constructor(status: number, kind: 'forbidden' | 'rate-limited' | 'server-error' | 'unknown', message: string) {
    super(message)
    this.name = 'NwsHttpError'
    this.status = status
    this.kind = kind
  }
}

export class NwsParseError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'NwsParseError'
    this.cause = cause
  }
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

/** Clears the in-memory response cache. Intended for test isolation between cases. */
export function clearNwsCache(): void {
  cache.clear()
}

function classifyError(res: Response): NwsHttpError {
  if (res.status === 403) {
    return new NwsHttpError(403, 'forbidden', 'NWS rejected this request (403) — it may be rate-limited or blocked; try again shortly.')
  }
  if (res.status === 429) {
    return new NwsHttpError(429, 'rate-limited', 'NWS rate limit exceeded — retry in a few seconds.')
  }
  if (res.status >= 500) {
    return new NwsHttpError(res.status, 'server-error', `NWS service error (${res.status}) — try again later.`)
  }
  return new NwsHttpError(res.status, 'unknown', `NWS request failed (${res.status}).`)
}

async function request<T>(path: string, parse: (raw: unknown) => T): Promise<T> {
  const url = `${NWS_BASE_URL}${path}`
  const cached = cache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T
  }

  const res = await fetch(url, { headers: { Accept: 'application/geo+json' } })
  if (!res.ok) {
    throw classifyError(res)
  }

  const raw: unknown = await res.json()
  let value: T
  try {
    value = parse(raw)
  } catch (err) {
    throw new NwsParseError(`NWS response for ${path} did not match the expected shape`, err)
  }

  cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export function getActiveAlerts(): Promise<NwsAlertCollection> {
  return request('/alerts/active', parseAlertCollection)
}

export function getPoint(lat: number, lon: number): Promise<NwsPoint> {
  return request(`/points/${lat},${lon}`, parsePoint)
}

export function getGridpointForecast(wfo: string, x: number, y: number): Promise<NwsGridpointForecast> {
  return request(`/gridpoints/${wfo}/${x},${y}/forecast`, parseGridpointForecast)
}

export function getStations(wfo: string, x: number, y: number): Promise<NwsStationCollection> {
  return request(`/gridpoints/${wfo}/${x},${y}/stations`, parseStationCollection)
}
