// Typed wrapper around SWPC's public JSON files (#54; see the swpc-ovation-aurora and
// swpc-geomagnetic-indices nodes in graph.json). They're static files regenerated every few
// minutes and served with access-control-allow-origin: *, so no special headers are needed.

import { createLiveClient } from './liveRequest'
import { parseKp1m, parseOvation, type SwpcKp1m, type SwpcOvation } from './swpcSchema'

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
