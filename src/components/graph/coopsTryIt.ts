// Formatted live results for the CO-OPS Metadata and Derived Product nodes (#241). Both APIs are
// per-station and have no bulk layer to draw, so Run sample fetches one station through coopsClient
// (so the calls are in the Inspector) and shows small tables in the detail panel.

import { getHtfAnnual, getSeaLevelTrend, getStationMetadata } from '../../data/coopsClient'
import type { CoopsFloodYear, CoopsResult, CoopsSeaLevelTrend, CoopsStationMetadata } from '../../data/coopsSchema'
import type { TryItTable } from './tryItTable'

/** Panama City, FL: the station both nodes' authored samples use. */
export const COOPS_TRY_IT_STATION = '8729108'

const FLOOD_YEARS = 10

const metres = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(2)} m`)
const count = (v: number | null) => (v === null ? 'n/a' : String(v))

export function stationTable(station: CoopsStationMetadata): TryItTable {
  const { details, floodlevels } = station
  return {
    caption: `${station.name}, ${station.state} (${station.id}); flood levels in m above station datum`,
    columns: ['Field', 'Value'],
    rows: [
      ['Established', details.established?.slice(0, 10) || 'n/a'],
      ['NOAA chart', details.noaachart || 'n/a'],
      ['Minor flood (NOS)', metres(floodlevels.nos_minor)],
      ['Moderate flood (NOS)', metres(floodlevels.nos_moderate)],
      ['Major flood (NOS)', metres(floodlevels.nos_major)],
    ],
  }
}

export function datumsTable(station: CoopsStationMetadata): TryItTable {
  const { datums } = station
  return {
    caption: datums.epoch ? `Datums (${datums.units}), ${datums.epoch} epoch` : `Datums (${datums.units})`,
    columns: ['Datum', 'Description', 'Value'],
    rows: datums.datums.map((d) => [d.name, d.description, d.value === null ? 'n/a' : String(d.value)]),
  }
}

/** "03/15/1973" to "1973-03"; anything else is passed through. */
function yearMonth(date: string): string {
  const match = /^(\d{2})\/\d{2}\/(\d{4})$/.exec(date)
  return match ? `${match[2]}-${match[1]}` : date
}

export function seaLevelTrendTable(trend: CoopsSeaLevelTrend): TryItTable {
  return {
    caption: `Sea level trend at ${trend.stationName}`,
    columns: ['Field', 'Value'],
    rows: [
      ['Trend', `${trend.trend} ± ${trend.trendError} ${trend.trendUnits}`],
      ['Record', `${yearMonth(trend.startDate)} to ${yearMonth(trend.endDate)}`],
    ],
  }
}

/** The latest years with any count, newest first. */
export function floodDaysTable(years: readonly CoopsFloodYear[]): TryItTable {
  const rows = years
    .filter((y) => y.minCount !== null || y.modCount !== null || y.majCount !== null)
    .sort((a, b) => b.year - a.year)
    .slice(0, FLOOD_YEARS)
    .map((y) => [String(y.year), count(y.minCount), count(y.modCount), count(y.majCount)])
  return { caption: `High tide flood days, latest ${rows.length} years`, columns: ['Year', 'Minor', 'Moderate', 'Major'], rows }
}

function unwrap<T>(result: CoopsResult<T>): T {
  if (!result.ok) throw new Error(result.message)
  return result.value
}

/** Node id to the loader its detail panel's "Run sample" button runs; each returns one or more tables. */
export const COOPS_TRY_ITS: Readonly<Partial<Record<string, () => Promise<TryItTable[]>>>> = {
  'coops-metadata-api': async () => {
    const station = await getStationMetadata(COOPS_TRY_IT_STATION)
    return [stationTable(station), datumsTable(station)]
  },
  'coops-derived-product-api': async () => {
    const [trend, floods] = await Promise.all([getSeaLevelTrend(COOPS_TRY_IT_STATION), getHtfAnnual(COOPS_TRY_IT_STATION)])
    return [seaLevelTrendTable(unwrap(trend)), floodDaysTable(floods)]
  },
}
