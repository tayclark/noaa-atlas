// Typed wrapper around the SPC GIS GeoJSON outlook files (#245; see the spc-gis-data node in
// graph.json). They're static files regenerated a few times a day and served with
// access-control-allow-origin: *, so no special headers are needed.

import { createLiveClient } from './liveRequest'
import { parseSpcOutlook, type SpcOutlook } from './spcSchema'

export class SpcHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`SPC request failed (${status}).`)
    this.name = 'SpcHttpError'
    this.status = status
  }
}

export class SpcParseError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'SpcParseError'
    this.cause = cause
  }
}

const { request, clearCache } = createLiveClient({
  baseUrl: 'https://www.spc.noaa.gov',
  headers: {},
  httpError: (res) => new SpcHttpError(res.status),
  parseError: (path, cause) => new SpcParseError(`SPC response for ${path} did not match the expected shape`, cause),
})

/** How often the globe re-fetches the outlook while it is shown; SPC reissues it a few times a day. */
export const SPC_REFRESH_MS = 10 * 60_000

/** Clears the in-memory response cache. Intended for test isolation between cases. */
export const clearSpcCache = clearCache

/** Today's Day 1 categorical convective outlook (TSTM, MRGL, SLGT, ENH, MDT, HIGH polygons). */
export function getDay1CategoricalOutlook(): Promise<SpcOutlook> {
  return request('/products/outlook/day1otlk_cat.nolyr.geojson', parseSpcOutlook)
}
