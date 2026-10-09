// Formatted live results for the two NCEI nodes (#242). Neither has a map layer: the Access Data
// Service is a per-station time series and the GOES-R archive is a directory of NetCDF files. Run
// sample fetches through nceiClient (so the calls are in the Inspector) and shows a table in the
// detail panel.

import { getDailySummaries, getGoesXrsListing, NceiHttpError } from '../../data/nceiClient'
import type { GoesArchiveFile, NceiDailySummary } from '../../data/nceiSchema'
import type { TryItTable } from './tryItTable'

/** Atlanta Hartsfield-Jackson, GA: the GHCN-Daily station the ADS sample uses. */
export const NCEI_TRY_IT_STATION = 'USW00013874'

/** GHCN-Daily lags a few days behind real time, so a two-week window always has recent rows. */
const WINDOW_DAYS = 14
const LISTING_ROWS = 10

const DAY_MS = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const reading = (v: number | null, unit: string) => (v === null ? 'n/a' : `${v.toFixed(1)} ${unit}`)

/** The UTC days from `WINDOW_DAYS` before `now` to yesterday, as "YYYY-MM-DD". */
export function dailyWindow(now: Date): { start: string; end: string } {
  const yesterday = now.getTime() - DAY_MS
  return { start: isoDay(yesterday - (WINDOW_DAYS - 1) * DAY_MS), end: isoDay(yesterday) }
}

/** Newest day first, since the latest readings are what a visitor wants to see. */
export function dailySummariesTable(rows: readonly NceiDailySummary[], station = NCEI_TRY_IT_STATION): TryItTable {
  const name = rows.find((r) => r.name)?.name ?? station
  return {
    caption:
      rows.length > 0
        ? `GHCN-Daily at ${name}, latest ${rows.length} days`
        : `GHCN-Daily at ${name}: no days reported in the last ${WINDOW_DAYS}`,
    columns: ['Date', 'Max temp.', 'Min temp.', 'Precip.'],
    rows: [...rows]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((r) => [r.date, reading(r.tmax, '°C'), reading(r.tmin, '°C'), reading(r.prcp, 'mm')]),
  }
}

export function goesListingTable(files: readonly GoesArchiveFile[], year: number, month: number): TryItTable {
  const shown = [...files].sort((a, b) => b.dataDate.localeCompare(a.dataDate)).slice(0, LISTING_ROWS)
  return {
    caption: `GOES-19 XRS one-minute flux files for ${year}-${String(month).padStart(2, '0')}, latest ${shown.length} of ${files.length}`,
    columns: ['Data date', 'File', 'Posted (UTC)', 'Size'],
    rows: shown.map((f) => [f.dataDate, f.name, f.modified, f.size]),
  }
}

/**
 * This month's listing, or last month's when this one is empty or a 404: daily files land about a
 * day after the data date, so early on the 1st the current month has nothing to list.
 */
export async function latestGoesListing(now: Date): Promise<TryItTable> {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  try {
    const files = await getGoesXrsListing(year, month)
    if (files.length > 0) return goesListingTable(files, year, month)
  } catch (err) {
    if (!(err instanceof NceiHttpError && err.status === 404)) throw err
  }
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  return goesListingTable(await getGoesXrsListing(prev.year, prev.month), prev.year, prev.month)
}

/** Node id to the loader its detail panel's "Run sample" button runs; each returns one or more tables. */
export const NCEI_TRY_ITS: Readonly<Partial<Record<string, () => Promise<TryItTable[]>>>> = {
  'ncei-access-data-service': async () => {
    const { start, end } = dailyWindow(new Date())
    return [dailySummariesTable(await getDailySummaries(NCEI_TRY_IT_STATION, start, end))]
  },
  'ncei-goes-r-space-weather': async () => [await latestGoesListing(new Date())],
}
