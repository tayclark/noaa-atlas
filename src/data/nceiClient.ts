// Typed wrappers behind the two NCEI try-its (#242; see the ncei-access-data-service and
// ncei-goes-r-space-weather nodes in graph.json). Both hosts send access-control-allow-origin: *, so
// no special headers are needed. They're separate live clients because each has its own base URL,
// and the GOES-R archive answers with an HTML directory listing rather than JSON.

import { createLiveClient } from './liveRequest'
import {
  parseDailySummaries,
  parseDirectoryListing,
  parseGoesListing,
  type GoesArchiveFile,
  type NceiDailySummary,
} from './nceiSchema'

export class NceiHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`NCEI request failed (${status}).`)
    this.name = 'NceiHttpError'
    this.status = status
  }
}

export class NceiParseError extends Error {
  readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'NceiParseError'
    this.cause = cause
  }
}

const options = {
  headers: {},
  httpError: (res: Response) => new NceiHttpError(res.status),
  parseError: (path: string, cause: unknown) => new NceiParseError(`NCEI response for ${path} did not match the expected shape`, cause),
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
