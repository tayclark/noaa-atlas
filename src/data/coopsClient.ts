// Typed wrapper around the CO-OPS Data API (#51; see the coops-data-api node in graph.json), plus the
// Metadata and Derived Product API calls behind their nodes' try-its (#241). All three send
// access-control-allow-origin: *, so no special headers are needed. Station positions come from the
// coopsStations.json snapshot rather than the Metadata API (see scripts/coops-stations.mjs).

import { createLiveClient } from './liveRequest'
import {
  parseHourlyPredictions,
  parseHtfAnnual,
  parsePredictions,
  parseSeaLevelTrend,
  parseStationMetadata,
  parseWaterLevel,
  type CoopsFloodYear,
  type CoopsReading,
  type CoopsResult,
  type CoopsSeaLevelTrend,
  type CoopsStationMetadata,
  type CoopsTide,
} from './coopsSchema'

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

/** Predicted water level every hour from `begin` to `end` (UTC "YYYYMMDD"), for the forecast timeline (#228). */
export function getHourlyPredictions(station: string, begin: string, end: string): Promise<CoopsResult<CoopsReading[]>> {
  return request(
    dataPath(station, 'predictions', { interval: 'h', begin_date: begin, end_date: end }),
    parseHourlyPredictions,
  )
}

/** The station's details, datums and NOS flood thresholds from the Metadata API, in metres. */
export function getStationMetadata(station: string): Promise<CoopsStationMetadata> {
  return request(`/mdapi/prod/webapi/stations/${encodeURIComponent(station)}.json?expand=details,datums,floodlevels&units=metric`, parseStationMetadata)
}

/** The station's long-term sea level trend from the Derived Product API, in mm/yr. */
export function getSeaLevelTrend(station: string): Promise<CoopsResult<CoopsSeaLevelTrend>> {
  return request(`/dpapi/prod/webapi/product/sealvltrends.json?station=${encodeURIComponent(station)}&units=metric`, parseSeaLevelTrend)
}

/** High tide flood days per year at the station, from the Derived Product API. */
export function getHtfAnnual(station: string): Promise<CoopsFloodYear[]> {
  return request(`/dpapi/prod/webapi/htf/htf_annual.json?station=${encodeURIComponent(station)}`, parseHtfAnnual)
}
