// Typed wrapper around NOAA's NHC tropical weather summary MapServer (#334; see the
// nhc-active-storms node in graph.json). Its layers hold every active storm at once, and the
// server answers a browser origin with access-control-allow-origin, which NHC's own
// CurrentStorms.json does not. Each layer is queried whole, as GeoJSON.

import { createLiveClient } from './liveRequest'
import {
  parseNhcCones,
  parseNhcForecastPoints,
  parseNhcPastPoints,
  type NhcCones,
  type NhcForecastPoints,
  type NhcPastPoints,
} from './nhcSchema'

export class NhcHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`NHC request failed (${status}).`)
    this.name = 'NhcHttpError'
    this.status = status
  }
}

export class NhcParseError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'NhcParseError'
    this.cause = cause
  }
}

const { request, clearCache } = createLiveClient({
  baseUrl: 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer',
  headers: {},
  httpError: (res) => new NhcHttpError(res.status),
  parseError: (path, cause) => new NhcParseError(`NHC response for ${path} did not match the expected shape`, cause),
})

/** The summary service's layer ids. */
export const NHC_LAYERS = { forecastPoints: 5, cone: 7, pastPoints: 10 } as const

/** How often the globe re-fetches the tracks while they are shown; advisories come every 3 to 6 hours. */
export const NHC_REFRESH_MS = 10 * 60_000

/** Clears the in-memory response cache. Intended for test isolation between cases. */
export const clearNhcCache = clearCache

const query = (layer: number) => `/${layer}/query?where=1%3D1&outFields=*&f=geojson`

export interface NhcStormData {
  past: NhcPastPoints
  forecast: NhcForecastPoints
  cones: NhcCones
}

/** Every active storm's past fixes, forecast fixes and forecast cone. All empty when no storm is active. */
export async function getActiveStorms(): Promise<NhcStormData> {
  const [past, forecast, cones] = await Promise.all([
    request(query(NHC_LAYERS.pastPoints), parseNhcPastPoints),
    request(query(NHC_LAYERS.forecastPoints), parseNhcForecastPoints),
    request(query(NHC_LAYERS.cone), parseNhcCones),
  ])
  return { past, forecast, cones }
}
