import { describe, expect, it } from 'vitest'
import { makeGridpointData } from './nwsFixtures'
import { parseGridpointData } from './nwsSchema'
import {
  buildForecastSeries,
  buildTideSeries,
  hasWaves,
  parseDuration,
  parseValidTime,
  sampleAt,
} from './forecastSeries'

const T0 = Date.parse('2026-10-01T00:00:00Z')
const HOUR = 3_600_000
const grid = (overrides: Record<string, unknown> = {}) => parseGridpointData(makeGridpointData(overrides))

describe('parseDuration', () => {
  it.each([
    ['PT1H', HOUR],
    ['PT30M', 1_800_000],
    ['P3DT12H', 84 * HOUR],
    ['P1D', 24 * HOUR],
  ])('reads %s', (text, ms) => expect(parseDuration(text)).toBe(ms))

  it.each(['', 'P', 'PT', '1H', 'PT1X'])('rejects %j', (text) => expect(parseDuration(text)).toBeNull())
})

describe('parseValidTime', () => {
  it('splits start and duration', () => {
    expect(parseValidTime('2026-10-01T00:00:00+00:00/PT2H')).toEqual({ start: T0, end: T0 + 2 * HOUR })
  })

  it('honours a zone offset', () => {
    expect(parseValidTime('2026-10-01T00:00:00-07:00/PT1H')?.start).toBe(T0 + 7 * HOUR)
  })

  it.each(['nonsense', '2026-10-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00/bad'])('rejects %j', (text) =>
    expect(parseValidTime(text)).toBeNull(),
  )
})

describe('buildForecastSeries', () => {
  it('expands multi-hour intervals to one sample per hour and converts units', () => {
    const series = buildForecastSeries(grid())
    expect(series.map((s) => s.time)).toEqual([T0, T0 + HOUR, T0 + 2 * HOUR])
    expect(series[0].windMph).toBeCloseTo(10.36, 1) // 16.668 km/h
    expect(series[1].windMph).toBeCloseTo(10.36, 1) // the PT2H interval covers hour 1 too
    expect(series[2].windMph).toBeCloseTo(12.66, 1)
    expect(series[2].gustMph).toBeCloseTo(18.41, 1)
    expect(series.map((s) => s.windFromDeg)).toEqual([240, 240, 240])
  })

  it('leaves hours without a wave value null and converts metres to feet', () => {
    const series = buildForecastSeries(grid())
    expect(series.map((s) => s.waveFt)).toEqual([0, expect.closeTo(1, 3), null])
    expect(hasWaves(series)).toBe(true)
  })

  it('has no waves for an inland grid', () => {
    const series = buildForecastSeries(grid({ waveHeight: {} }))
    expect(series.every((s) => s.waveFt === null)).toBe(true)
    expect(hasWaves(series)).toBe(false)
  })

  it('returns nothing when there is no wind data', () => {
    expect(buildForecastSeries(grid({ windSpeed: { values: [] } }))).toEqual([])
  })

  it('keeps null values and skips malformed intervals', () => {
    const series = buildForecastSeries(
      grid({
        windSpeed: {
          uom: 'wmoUnit:m_s-1',
          values: [
            { validTime: '2026-10-01T00:00:00+00:00/PT1H', value: null },
            { validTime: 'bad', value: 5 },
            { validTime: '2026-10-01T01:00:00+00:00/PT1H', value: 10 },
          ],
        },
      }),
    )
    expect(series.map((s) => s.windMph)).toEqual([null, expect.closeTo(22.37, 1)])
  })
})

describe('buildTideSeries', () => {
  it('reads CO-OPS UTC times and drops hours with no value', () => {
    expect(
      buildTideSeries([
        { time: '2026-10-01 00:00', metres: 0.4 },
        { time: '2026-10-01 01:00', metres: null },
        { time: 'garbage', metres: 1 },
      ]),
    ).toEqual([{ time: T0, metres: 0.4 }])
  })
})

describe('sampleAt', () => {
  const series = [T0, T0 + HOUR, T0 + 2 * HOUR].map((time) => ({ time }))

  it('returns the hour the time falls in', () => {
    expect(sampleAt(series, T0 + 90 * 60_000)).toBe(series[1])
    expect(sampleAt(series, T0)).toBe(series[0])
  })

  it('returns null outside the series', () => {
    expect(sampleAt(series, T0 - 1)).toBeNull()
    expect(sampleAt(series, T0 + 3 * HOUR)).toBeNull()
    expect(sampleAt([], T0)).toBeNull()
  })
})
