// Turns the NWS raw grid (and CO-OPS hourly predictions) into one hourly series the forecast
// timeline draws (#228). Pure, so the interval maths is unit-tested instead of left to the chart.

import type { CoopsReading } from './coopsSchema'
import type { NwsGridLayer, NwsGridpointData } from './nwsSchema'

const HOUR_MS = 3_600_000

export interface ForecastSample {
  /** Epoch ms, on the hour. */
  time: number
  windMph: number | null
  gustMph: number | null
  /** Degrees the wind blows from. */
  windFromDeg: number | null
  waveFt: number | null
}

export interface TideSample {
  time: number
  /** Metres above MLLW. */
  metres: number
}

const MPH_PER_UNIT: Record<string, number> = {
  'wmoUnit:km_h-1': 0.621371,
  'wmoUnit:m_s-1': 2.23694,
  'wmoUnit:kn': 1.15078,
}
const FEET_PER_METRE = 3.28084

/** "PT1H", "P3DT12H" or "PT30M" in ms, or null when it is not a duration NWS sends. */
export function parseDuration(duration: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration)
  if (!m || duration === 'P' || duration === 'PT') return null
  const [, d = '0', h = '0', min = '0'] = m
  return (Number(d) * 24 + Number(h)) * HOUR_MS + Number(min) * 60_000
}

/** "2026-10-01T00:00:00+00:00/PT2H" as a half-open [start, end) in epoch ms, or null if malformed. */
export function parseValidTime(validTime: string): { start: number; end: number } | null {
  const [startText, durationText] = validTime.split('/')
  const start = Date.parse(startText)
  const duration = durationText === undefined ? null : parseDuration(durationText)
  if (Number.isNaN(start) || duration === null) return null
  return { start, end: start + duration }
}

/** The layer's value at each hour from `from` (inclusive) to `to` (exclusive); null where it has none. */
function hourly(layer: NwsGridLayer | undefined, from: number, to: number, convert: (v: number) => number): (number | null)[] {
  const out: (number | null)[] = []
  const intervals = (layer?.values ?? []).flatMap((v) => {
    const span = parseValidTime(v.validTime)
    return span ? [{ ...span, value: v.value }] : []
  })
  for (let t = from; t < to; t += HOUR_MS) {
    const hit = intervals.find((i) => t >= i.start && t < i.end)
    out.push(hit && hit.value !== null ? convert(hit.value) : null)
  }
  return out
}

/** The hour the grid starts at: the earliest wind interval, so a stale layer cannot stretch the range. */
function windSpan(data: NwsGridpointData): { from: number; to: number } | null {
  const spans = data.properties.windSpeed.values.flatMap((v) => {
    const s = parseValidTime(v.validTime)
    return s ? [s] : []
  })
  if (spans.length === 0) return null
  const from = Math.floor(Math.min(...spans.map((s) => s.start)) / HOUR_MS) * HOUR_MS
  const to = Math.max(...spans.map((s) => s.end))
  return { from, to }
}

/**
 * One sample per hour across the wind forecast. Speeds are in mph and waves in feet (the units
 * the rest of the app shows). The waves are NWS's whole-foot steps, so they are not interpolated.
 */
export function buildForecastSeries(data: NwsGridpointData): ForecastSample[] {
  const span = windSpan(data)
  if (!span) return []
  const { windSpeed, windDirection, windGust, waveHeight } = data.properties
  const speed = (layer: NwsGridLayer) => (v: number) => v * (MPH_PER_UNIT[layer.uom ?? ''] ?? MPH_PER_UNIT['wmoUnit:km_h-1'])
  const wind = hourly(windSpeed, span.from, span.to, speed(windSpeed))
  const gust = hourly(windGust, span.from, span.to, speed(windGust))
  const dir = hourly(windDirection, span.from, span.to, (v) => v)
  const wave = hourly(waveHeight, span.from, span.to, (v) => v * FEET_PER_METRE)
  return wind.map((windMph, i) => ({
    time: span.from + i * HOUR_MS,
    windMph,
    gustMph: gust[i],
    windFromDeg: dir[i],
    waveFt: wave[i],
  }))
}

/** True when any hour has a wave height, so the chart can drop the row for inland points. */
export function hasWaves(series: ForecastSample[]): boolean {
  return series.some((s) => s.waveFt !== null)
}

/** CO-OPS "YYYY-MM-DD HH:mm" (UTC) readings as tide samples, dropping hours with no value. */
export function buildTideSeries(readings: CoopsReading[]): TideSample[] {
  return readings.flatMap((r) => {
    // V8's Date.parse is lenient with free text, so check the shape before trusting it.
    const time = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.time) ? Date.parse(`${r.time.replace(' ', 'T')}:00Z`) : NaN
    return r.metres === null || Number.isNaN(time) ? [] : [{ time, metres: r.metres }]
  })
}

/** The sample at or just before `time` (the hour the cursor sits in), or null outside the series. */
export function sampleAt<T extends { time: number }>(series: T[], time: number): T | null {
  const first = series[0]
  if (!first || time < first.time || time >= series[series.length - 1].time + HOUR_MS) return null
  let found: T | null = null
  for (const s of series) {
    if (s.time > time) break
    found = s
  }
  return found
}
