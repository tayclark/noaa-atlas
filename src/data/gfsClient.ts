// Client for the NCEP GFS 10 m wind and GFS-Wave significant wave height fields, read straight from the public AWS Open Data bucket
// (#229). The bucket sends `access-control-allow-origin: *` and honours Range requests, so no proxy
// is needed: the `.idx` sidecar gives each field's byte range and only that field (~80 kB for wind,
// ~430 kB for waves) is fetched.
// Requests are logged to requestLog.ts for the Inspector, like the other live clients. The wave
// field's JPEG 2000 decode runs in a worker (gribDecodeClient.ts, #291).

import { decodeGribField, type GribField } from './grib2'
import { decodeWaveField } from './gribDecodeClient'
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

export type GfsProduct = 'atmos' | 'wave'

function fieldPath(cycle: number, hour: number, product: GfsProduct = 'atmos'): string {
  const d = new Date(cycle)
  const day = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  const cc = pad(d.getUTCHours())
  const f = String(hour).padStart(3, '0')
  return product === 'wave'
    ? `/gfs.${day}/${cc}/wave/gridded/gfswave.t${cc}z.global.0p25.f${f}.grib2`
    : `/gfs.${day}/${cc}/atmos/gfs.t${cc}z.pgrb2.1p00.f${f}`
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

const cycleCache = new Map<GfsProduct, { cycle: number; expiresAt: number }>()
const fieldCache = new Map<string, Promise<WindField>>()
const waveCache = new Map<string, Promise<GribField>>()

/** Clears the cycle and field caches. Intended for test isolation between cases. */
export function clearGfsCache(): void {
  cycleCache.clear()
  fieldCache.clear()
  waveCache.clear()
  reflectivityCache.clear()
}

/** The newest GFS cycle whose first file is already published (the wave files can lag the atmos ones). */
export async function getLatestCycle(now = Date.now(), product: GfsProduct = 'atmos'): Promise<number> {
  const cached = cycleCache.get(product)
  if (cached && cached.expiresAt > now) return cached.cycle
  let lastError: unknown = new GfsHttpError(404)
  for (const cycle of cycleCandidates(now)) {
    try {
      await logged(`${fieldPath(cycle, 0, product)}.idx`, {}, async () => ({ cycle: new Date(cycle).toISOString() }))
      cycleCache.set(product, { cycle, expiresAt: now + CYCLE_TTL_MS })
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

const reflectivityCache = new Map<string, Promise<GribField>>()

/** Composite reflectivity (dBZ, the model's simulated radar) for `hour` hours after `cycle` (#340). Cached for the session. */
export function getReflectivityField(cycle: number, hour: number): Promise<GribField> {
  const path = fieldPath(cycle, hour)
  const cached = reflectivityCache.get(path)
  if (cached) return cached
  const pending = (async () => {
    const idx = await (await logged(`${path}.idx`, {}, async () => ({ bytes: 'index' }))).text()
    const entry = findGribField(parseGribIdx(idx), 'REFC', 'entire atmosphere')
    if (!entry) throw new Error('GFS index has no REFC')
    const headers = { Range: rangeHeader(entry) }
    const res = await logged(path, headers, async (r) => ({ name: 'REFC', bytes: (await r.arrayBuffer()).byteLength }))
    return decodeGribField(await res.arrayBuffer())
  })()
  reflectivityCache.set(path, pending)
  pending.catch(() => reflectivityCache.delete(path))
  while (reflectivityCache.size > FIELD_CACHE_SIZE) reflectivityCache.delete(reflectivityCache.keys().next().value as string)
  return pending
}

/** Significant wave height (m) for `hour` hours after the wave `cycle`; land is NaN. Cached for the session. */
export function getWaveField(cycle: number, hour: number): Promise<GribField> {
  const path = fieldPath(cycle, hour, 'wave')
  const cached = waveCache.get(path)
  if (cached) return cached
  const pending = (async () => {
    const idx = await (await logged(`${path}.idx`, {}, async () => ({ bytes: 'index' }))).text()
    const entry = findGribField(parseGribIdx(idx), 'HTSGW', 'surface')
    if (!entry) throw new Error('GFS-Wave index has no HTSGW')
    const headers = { Range: rangeHeader(entry) }
    const res = await logged(path, headers, async (r) => ({ name: 'HTSGW', bytes: (await r.arrayBuffer()).byteLength }))
    return decodeWaveField(await res.arrayBuffer())
  })()
  waveCache.set(path, pending)
  pending.catch(() => waveCache.delete(path))
  while (waveCache.size > FIELD_CACHE_SIZE) waveCache.delete(waveCache.keys().next().value as string)
  return pending
}
