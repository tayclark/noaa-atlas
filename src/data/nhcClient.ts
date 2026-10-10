// Typed wrapper around NOAA's NHC tropical weather summary MapServer (#334; see the
// nhc-active-storms node in graph.json). Its layers hold every active storm at once, and the
// server answers a browser origin with access-control-allow-origin, which NHC's own
// CurrentStorms.json does not. Each layer is queried whole, as GeoJSON.

import { makeClientErrors, type ClientHttpError, type ClientParseError } from './clientErrors'
import { createLiveClient } from './liveRequest'
import {
  parseNhcCones,
  parseNhcForecastPoints,
  parseNhcPastPoints,
  type NhcCones,
  type NhcForecastPoints,
  type NhcPastPoints,
} from './nhcSchema'

export const nhcErrors = makeClientErrors('NHC', 'Nhc')
export const NhcHttpError = nhcErrors.HttpError
export type NhcHttpError = ClientHttpError
export const NhcParseError = nhcErrors.ParseError
export type NhcParseError = ClientParseError

const { request, invalidate, clearCache } = createLiveClient({
  baseUrl: 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer',
  headers: {},
  httpError: nhcErrors.httpError,
  parseError: nhcErrors.parseError,
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

/**
 * Every active storm's past fixes, forecast fixes and forecast cone. All empty when no storm is
 * active. The three layers are one picture, so when any of them fails the ones that loaded are
 * dropped from the cache too: the next refresh fetches all three again rather than pairing a fresh
 * layer with ones from an older advisory.
 */
export async function getActiveStorms(): Promise<NhcStormData> {
  const paths = [query(NHC_LAYERS.pastPoints), query(NHC_LAYERS.forecastPoints), query(NHC_LAYERS.cone)]
  const [past, forecast, cones] = await Promise.allSettled([
    request(paths[0], parseNhcPastPoints),
    request(paths[1], parseNhcForecastPoints),
    request(paths[2], parseNhcCones),
  ])
  if (past.status === 'fulfilled' && forecast.status === 'fulfilled' && cones.status === 'fulfilled') {
    return { past: past.value, forecast: forecast.value, cones: cones.value }
  }
  for (const path of paths) invalidate(path)
  throw [past, forecast, cones].find((r) => r.status === 'rejected')?.reason
}
