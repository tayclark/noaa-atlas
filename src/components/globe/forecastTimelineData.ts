// Loads what the point forecast timeline draws (#228): the NWS hourly grid for the point and, when
// a tide station is close, its hourly prediction curve. Kept out of the component so the
// sequencing and the "tides are optional" rule are unit-tested.

import { getHourlyPredictions } from '../../data/coopsClient'
import type { LonLat } from '../../data/coverageLookup'
import {
  buildForecastSeries,
  buildTideSeries,
  type ForecastSample,
  type TideSample,
} from '../../data/forecastSeries'
import { tideStationFor } from '../../data/nearestTideStation'
import { getGridpointData, getPoint } from '../../data/nwsClient'

export interface ForecastTimelineData {
  series: ForecastSample[]
  tides: TideSample[]
  /** The tide station the curve came from, when one is near. */
  station: { id: string; name: string } | null
  /** Why a nearby station gave no curve; the wind and waves still show. */
  tideMessage: string | null
}

const HOUR_MS = 3_600_000

/** UTC "YYYYMMDD" as CO-OPS wants it. */
export function coopsDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10).replaceAll('-', '')
}

export async function loadForecastTimeline(point: LonLat): Promise<ForecastTimelineData> {
  const [lng, lat] = point
  const { gridId, gridX, gridY } = (await getPoint(lat, lng)).properties
  const series = buildForecastSeries(await getGridpointData(gridId, gridX, gridY))
  if (series.length === 0) throw new Error('The forecast for this point has no wind data.')

  const station = tideStationFor(point)
  if (!station) return { series, tides: [], station: null, tideMessage: null }

  const begin = coopsDate(series[0].time)
  const end = coopsDate(series[series.length - 1].time + HOUR_MS)
  const named = { id: station.id, name: station.name }
  try {
    const result = await getHourlyPredictions(station.id, begin, end)
    if (!result.ok) return { series, tides: [], station: named, tideMessage: result.message }
    return { series, tides: buildTideSeries(result.value), station: named, tideMessage: null }
  } catch {
    return { series, tides: [], station: named, tideMessage: 'The tide predictions could not be loaded.' }
  }
}
