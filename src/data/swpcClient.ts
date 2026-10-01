// Typed wrapper around SWPC's public JSON files (#54; see the swpc-ovation-aurora and
// swpc-geomagnetic-indices nodes in graph.json). They're static files regenerated every few
// minutes and served with access-control-allow-origin: *, so no special headers are needed.

import { createLiveClient } from './liveRequest'
import {
  parseAlerts,
  parseKp1m,
  parseOvation,
  parseScales,
  parseSolarWind,
  parseXrays,
  type SwpcAlerts,
  type SwpcKp1m,
  type SwpcOvation,
  type SwpcScales,
  type SwpcSolarWind,
  type SwpcXrays,
} from './swpcSchema'

export class SwpcHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`SWPC request failed (${status}).`)
    this.name = 'SwpcHttpError'
    this.status = status
  }
}

export class SwpcParseError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'SwpcParseError'
    this.cause = cause
  }
}

const { request, clearCache } = createLiveClient({
  baseUrl: 'https://services.swpc.noaa.gov',
  headers: {},
  httpError: (res) => new SwpcHttpError(res.status),
  parseError: (path, cause) => new SwpcParseError(`SWPC response for ${path} did not match the expected shape`, cause),
})

/** How often the globe re-fetches the aurora forecast and Kp; SWPC regenerates both every few minutes. */
export const SWPC_REFRESH_MS = 5 * 60_000

/** Clears the in-memory response cache. Intended for test isolation between cases. */
export const clearSwpcCache = clearCache

/** The latest OVATION aurora forecast: a global 1° grid, about 1 MB. */
export function getOvationAurora(): Promise<SwpcOvation> {
  return request('/json/ovation_aurora_latest.json', parseOvation)
}

/** The running one-minute planetary Kp estimate over about the last six hours. */
export function getPlanetaryKp(): Promise<SwpcKp1m> {
  return request('/json/planetary_k_index_1m.json', parseKp1m)
}

/** Current and forecast NOAA space weather scales (R, S, G). */
export function getNoaaScales(): Promise<SwpcScales> {
  return request('/products/noaa-scales.json', parseScales)
}

/** Alerts, watches and warnings issued over the past few days (about 40 KB). */
export function getSpaceWeatherAlerts(): Promise<SwpcAlerts> {
  return request('/products/alerts.json', parseAlerts)
}

/** The active L1 spacecraft's recent one-minute solar wind plasma readings (the file is about 3 MB). */
export function getSolarWind(): Promise<SwpcSolarWind> {
  return request('/json/rtsw/rtsw_wind_1m.json', parseSolarWind)
}

/** GOES primary-satellite X-ray flux for the past six hours, both bands. */
export function getGoesXrays(): Promise<SwpcXrays> {
  return request('/json/goes/primary/xrays-6-hour.json', parseXrays)
}
