// Typed wrapper around the SPC GIS GeoJSON outlook files (#245; see the spc-gis-data node in
// graph.json). They're static files regenerated a few times a day and served with
// access-control-allow-origin: *, so no special headers are needed.

import { makeClientErrors, type ClientHttpError, type ClientParseError } from './clientErrors'
import { createLiveClient } from './liveRequest'
import { parseSpcOutlook, type SpcOutlook } from './spcSchema'

export const spcErrors = makeClientErrors('SPC', 'Spc')
export const SpcHttpError = spcErrors.HttpError
export type SpcHttpError = ClientHttpError
export const SpcParseError = spcErrors.ParseError
export type SpcParseError = ClientParseError

const { request, clearCache } = createLiveClient({
  baseUrl: 'https://www.spc.noaa.gov',
  headers: {},
  httpError: spcErrors.httpError,
  parseError: spcErrors.parseError,
})

/** How often the globe re-fetches the outlook while it is shown; SPC reissues it a few times a day. */
export const SPC_REFRESH_MS = 10 * 60_000

/** Clears the in-memory response cache. Intended for test isolation between cases. */
export const clearSpcCache = clearCache

/** Today's Day 1 categorical convective outlook (TSTM, MRGL, SLGT, ENH, MDT, HIGH polygons). */
export function getDay1CategoricalOutlook(): Promise<SpcOutlook> {
  return request('/products/outlook/day1otlk_cat.nolyr.geojson', parseSpcOutlook)
}
