// Client for the NCEP GFS 10 m wind field, read straight from the public AWS Open Data bucket
// (#229). The bucket sends `access-control-allow-origin: *` and honours Range requests, so no proxy
// is needed: the `.idx` sidecar gives each field's byte range and only those ~80 kB are fetched.
// Requests are logged to requestLog.ts for the Inspector, like the other live clients.

import { decodeGribField, type GribField } from './grib2'
import { findGribField, parseGribIdx, rangeHeader } from './gribIdx'
import { pushLogEntry, type RequestLogStatus } from './requestLog'

const BASE_URL = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com'
const CYCLE_MS = 6 * 3_600_000
/** A cycle is usually complete about 4.5 hours after its nominal time. */
const PUBLISH_DELAY_MS = 4.5 * 3_600_000
export const STEP_HOURS = 3
export const MAX_FORECAST_HOUR = 120
const CYCLE_TTL_MS = 10 * 60_000
const FIELD_CACHE_SIZE = 8

export class GfsHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`GFS request failed (${status}).`)
    this.name = 'GfsHttpError'
    this.status = status
  }
}

export interface WindField {
  /** Eastward and northward 10 m wind components, m/s, on the same grid. */
  u: GribField
  v: GribField
}

/** The model run time (epoch ms, always 00, 06, 12 or 18 UTC) at or before `ms`. */
export function cycleAtOrBefore(ms: number): number {
  return Math.floor(ms / CYCLE_MS) * CYCLE_MS
}

/** Newest cycle first: the latest that should be published by `now`, then two earlier fallbacks. */
export function cycleCandidates(now: number): number[] {
  const newest = cycleAtOrBefore(now - PUBLISH_DELAY_MS)
  return [newest, newest - CYCLE_MS, newest - 2 * CYCLE_MS]
}

/** The forecast hour to show at `time`: nearest available step, clamped to the file range. */
export function forecastHourFor(cycle: number, time: number): number {
  const hours = Math.round((time - cycle) / 3_600_000 / STEP_HOURS) * STEP_HOURS
  return Math.min(MAX_FORECAST_HOUR, Math.max(0, hours))
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fieldPath(cycle: number, hour: number): string {
  const d = new Date(cycle)
  const day = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  const cc = pad(d.getUTCHours())
  return `/gfs.${day}/${cc}/atmos/gfs.t${cc}z.pgrb2.1p00.f${String(hour).padStart(3, '0')}`
}

async function logged(path: string, headers: Record<string, string>, read: (res: Response) => Promise<unknown>): Promise<Response> {
  const url = `${BASE_URL}${path}`
  const startedAt = Date.now()
  const t0 = performance.now()
  const log = (status: RequestLogStatus, extra: { httpStatus?: number; responseBody?: unknown; errorMessage?: string } = {}) =>
    pushLogEntry({
      id: crypto.randomUUID(),
      method: 'GET',
      url,
      path,
      requestHeaders: headers,
      startedAt,
      durationMs: performance.now() - t0,
      status,
      ...extra,
    })
  let res: Response
  try {
    res = await fetch(url, { headers })
  } catch (err) {
    log('network-error', { errorMessage: err instanceof Error ? err.message : 'Network request failed' })
    throw err
  }
  if (!res.ok) {
    log('http-error', { httpStatus: res.status })
    throw new GfsHttpError(res.status)
  }
  log('success', { httpStatus: res.status, responseBody: await read(res.clone()) })
  return res
}

let cycleCache: { cycle: number; expiresAt: number } | null = null
const fieldCache = new Map<string, Promise<WindField>>()

/** Clears the cycle and field caches. Intended for test isolation between cases. */
export function clearGfsCache(): void {
  cycleCache = null
  fieldCache.clear()
}

/** The newest GFS cycle whose first file is already published. */
export async function getLatestCycle(now = Date.now()): Promise<number> {
  if (cycleCache && cycleCache.expiresAt > now) return cycleCache.cycle
  let lastError: unknown = new GfsHttpError(404)
  for (const cycle of cycleCandidates(now)) {
    try {
      await logged(`${fieldPath(cycle, 0)}.idx`, {}, async () => ({ cycle: new Date(cycle).toISOString() }))
      cycleCache = { cycle, expiresAt: now + CYCLE_TTL_MS }
      return cycle
    } catch (err) {
      if (!(err instanceof GfsHttpError) || err.status !== 404) throw err
      lastError = err
    }
  }
  throw lastError
}

async function fetchComponent(path: string, idxText: string, name: 'UGRD' | 'VGRD'): Promise<GribField> {
  const entry = findGribField(parseGribIdx(idxText), name, '10 m above ground')
  if (!entry) throw new Error(`GFS index has no 10 m ${name}`)
  const headers = { Range: rangeHeader(entry) }
  const res = await logged(path, headers, async (r) => ({ name, bytes: (await r.arrayBuffer()).byteLength }))
  return decodeGribField(await res.arrayBuffer())
}

/** The 10 m wind field for `hour` hours after `cycle`. Results are cached for the session. */
export function getWindField(cycle: number, hour: number): Promise<WindField> {
  const path = fieldPath(cycle, hour)
  const cached = fieldCache.get(path)
  if (cached) return cached
  const pending = (async () => {
    const idx = await (await logged(`${path}.idx`, {}, async () => ({ bytes: 'index' }))).text()
    const [u, v] = await Promise.all([fetchComponent(path, idx, 'UGRD'), fetchComponent(path, idx, 'VGRD')])
    return { u, v }
  })()
  fieldCache.set(path, pending)
  pending.catch(() => fieldCache.delete(path))
  while (fieldCache.size > FIELD_CACHE_SIZE) fieldCache.delete(fieldCache.keys().next().value as string)
  return pending
}
