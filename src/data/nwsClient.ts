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
  parseGridpointData,
  parseGridpointForecast,
  parseObservation,
  parsePoint,
  parseStationCollection,
  type NwsAlertCollection,
  type NwsGridpointData,
  type NwsGridpointForecast,
  type NwsObservation,
  type NwsPoint,
  type NwsStationCollection,
} from './nwsSchema'
import { makeClientErrors, type ClientHttpError, type ClientParseError, type HttpErrorKind } from './clientErrors'
import { createLiveClient } from './liveRequest'

function nwsMessage(status: number, kind: HttpErrorKind): string {
  if (kind === 'forbidden') return 'NWS rejected this request (403) — it may be rate-limited or blocked; try again shortly.'
  if (kind === 'rate-limited') return 'NWS rate limit exceeded — retry in a few seconds.'
  if (kind === 'server-error') return `NWS service error (${status}) — try again later.`
  return `NWS request failed (${status}).`
}

export const nwsErrors = makeClientErrors('NWS', 'Nws', nwsMessage)
export const NwsHttpError = nwsErrors.HttpError
export type NwsHttpError = ClientHttpError
export const NwsParseError = nwsErrors.ParseError
export type NwsParseError = ClientParseError

const { request, clearCache } = createLiveClient({
  baseUrl: 'https://api.weather.gov',
  headers: { Accept: 'application/geo+json' },
  httpError: nwsErrors.httpError,
  parseError: nwsErrors.parseError,
})

/** Clears the in-memory response cache. Intended for test isolation between cases. */
export const clearNwsCache = clearCache

export function getActiveAlerts(): Promise<NwsAlertCollection> {
  return request('/alerts/active', parseAlertCollection)
}

// The NWS answers a coordinate with more than four decimals by redirecting to the four-decimal one,
// which is an extra round trip, and two taps a metre apart would otherwise be two cache entries (#78).
const fourDecimals = (degrees: number) => Number(degrees.toFixed(4))

export function getPoint(lat: number, lon: number): Promise<NwsPoint> {
  return request(`/points/${fourDecimals(lat)},${fourDecimals(lon)}`, parsePoint)
}

export function getGridpointForecast(wfo: string, x: number, y: number): Promise<NwsGridpointForecast> {
  return request(`/gridpoints/${wfo}/${x},${y}/forecast`, parseGridpointForecast)
}

/** The raw forecast grid: hourly wind, plus wave height where the office publishes it (#228). */
export function getGridpointData(wfo: string, x: number, y: number): Promise<NwsGridpointData> {
  return request(`/gridpoints/${wfo}/${x},${y}`, parseGridpointData)
}

export function getStations(wfo: string, x: number, y: number): Promise<NwsStationCollection> {
  return request(`/gridpoints/${wfo}/${x},${y}/stations`, parseStationCollection)
}

export function getLatestObservation(stationId: string): Promise<NwsObservation> {
  return request(`/stations/${stationId}/observations/latest`, parseObservation)
}
