// Typed wrappers behind the two NCEI try-its (#242; see the ncei-access-data-service and
// ncei-goes-r-space-weather nodes in graph.json). Both hosts send access-control-allow-origin: *, so
// no special headers are needed. They're separate live clients because each has its own base URL,
// and the GOES-R archive answers with an HTML directory listing rather than JSON.

import { makeClientErrors, type ClientHttpError, type ClientParseError } from './clientErrors'
import { createLiveClient } from './liveRequest'
import {
  parseDailySummaries,
  parseDirectoryListing,
  parseGoesListing,
  type GoesArchiveFile,
  type NceiDailySummary,
} from './nceiSchema'

const nceiErrors = makeClientErrors('NCEI', 'Ncei')
export const NceiHttpError = nceiErrors.HttpError
export type NceiHttpError = ClientHttpError
export const NceiParseError = nceiErrors.ParseError
export type NceiParseError = ClientParseError

const options = {
  headers: {},
  httpError: nceiErrors.httpError,
  parseError: nceiErrors.parseError,
}

const accessData = createLiveClient({ baseUrl: 'https://www.ncei.noaa.gov', ...options })
const archive = createLiveClient({ baseUrl: 'https://data.ngdc.noaa.gov', decode: parseDirectoryListing, ...options })

/** Clears both clients' in-memory response caches. Intended for test isolation between cases. */
export function clearNceiCache(): void {
  accessData.clearCache()
  archive.clearCache()
}

/** GHCN-Daily max and min temperature (°C) and precipitation (mm) for a station, `start` to `end` ("YYYY-MM-DD"). */
export function getDailySummaries(station: string, start: string, end: string): Promise<NceiDailySummary[]> {
  const params = new URLSearchParams({
    dataset: 'daily-summaries',
    stations: station,
    startDate: start,
    endDate: end,
    dataTypes: 'TMAX,TMIN,PRCP',
    units: 'metric',
    includeStationName: 'true',
    format: 'json',
  })
  return accessData.request(`/access/services/data/v1?${params}`, parseDailySummaries)
}

export const GOES_XRS_ARCHIVE_PATH = '/platforms/solar-space-observing-satellites/goes/goes19/l2/data/xrsf-l2-avg1m_science'

/** The daily GOES-19 XRS one-minute flux files posted for a month (`month` is 1-12). A month not started yet is a 404. */
export function getGoesXrsListing(year: number, month: number): Promise<GoesArchiveFile[]> {
  return archive.request(`${GOES_XRS_ARCHIVE_PATH}/${year}/${String(month).padStart(2, '0')}/`, parseGoesListing)
}
