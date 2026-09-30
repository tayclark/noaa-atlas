// Typed wrapper around the CO-OPS Data API (#51; see the coops-data-api node in graph.json). It
// sends access-control-allow-origin: *, so no special headers are needed. Station positions come
// from the coopsStations.json snapshot rather than the Metadata API (see scripts/coops-stations.mjs).

import { createLiveClient } from './liveRequest'
import { parsePredictions, parseWaterLevel, type CoopsReading, type CoopsResult, type CoopsTide } from './coopsSchema'

export class CoopsHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`CO-OPS request failed (${status}).`)
    this.name = 'CoopsHttpError'
    this.status = status
  }
}

export class CoopsParseError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'CoopsParseError'
    this.cause = cause
  }
}

const { request, clearCache } = createLiveClient({
  baseUrl: 'https://api.tidesandcurrents.noaa.gov',
  headers: {},
  httpError: (res) => new CoopsHttpError(res.status),
  parseError: (path, cause) => new CoopsParseError(`CO-OPS response for ${path} did not match the expected shape`, cause),
})

/** Clears the in-memory response cache. Intended for test isolation between cases. */
export const clearCoopsCache = clearCache

function dataPath(station: string, product: string, extra: Record<string, string>): string {
  const params = new URLSearchParams({
    product,
    application: 'noaa-atlas',
    station,
    datum: 'MLLW',
    time_zone: 'gmt',
    units: 'metric',
    format: 'json',
    ...extra,
  })
  return `/api/prod/datagetter?${params}`
}

/** The station's latest water-level reading (null when it has none), in metres above MLLW. */
export function getWaterLevel(station: string): Promise<CoopsResult<CoopsReading | null>> {
  return request(dataPath(station, 'water_level', { date: 'latest' }), parseWaterLevel)
}

/** Today's predicted high and low tides (UTC day) at the station. */
export function getHiloPredictions(station: string): Promise<CoopsResult<CoopsTide[]>> {
  return request(dataPath(station, 'predictions', { date: 'today', interval: 'hilo' }), parsePredictions)
}
