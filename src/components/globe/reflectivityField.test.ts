import { describe, expect, it } from 'vitest'
import type { GribField } from '../../data/grib2'
import { bandFor, describeReflectivity, MIN_DBZ, reflectivityBlend, reflectivityStep, REFLECTIVITY_BANDS, renderReflectivity } from './reflectivityField'

/** A 2x2 global grid (lat 90 and -90, lon 0 and 180) with one value everywhere. */
function uniform(value: number): GribField {
  return { ni: 2, nj: 2, lat1: 90, lon1: 0, di: 180, dj: 180, southToNorth: false, values: new Float32Array(4).fill(value) }
}

describe('bandFor', () => {
  it('is transparent below light rain, then steps every 5 dBZ, capped at the top band', () => {
    expect(bandFor(MIN_DBZ - 0.1)).toBe(-1)
    expect(bandFor(Number.NaN)).toBe(-1)
    expect(bandFor(15)).toBe(0)
    expect(bandFor(39.9)).toBe(4)
    expect(bandFor(40)).toBe(5)
    expect(bandFor(90)).toBe(REFLECTIVITY_BANDS.length - 1)
  })
})

describe('renderReflectivity', () => {
  it('paints rain in its band colour and leaves dry air transparent', () => {
    const wet = renderReflectivity(4, 4, { a: uniform(42), b: null, t: 0 })
    expect([...wet.slice(0, 4)]).toEqual([0xe5, 0xbc, 0x00, 210])
    const dry = renderReflectivity(4, 4, { a: uniform(5), b: null, t: 0 })
    expect(dry.every((v) => v === 0)).toBe(true)
  })

  it('cross-fades two forecast hours', () => {
    const mid = renderReflectivity(2, 2, { a: uniform(10), b: uniform(30), t: 0.5 })
    expect([...mid.slice(0, 4)]).toEqual([0x02, 0xfd, 0x02, 210])
  })
})

describe('steps', () => {
  it('finds the 3-hour file step and how far through it a time is', () => {
    const t = Date.parse('2026-10-10T04:30:00Z')
    expect(new Date(reflectivityStep(t)).toISOString()).toBe('2026-10-10T03:00:00.000Z')
    expect(reflectivityBlend(t)).toBeCloseTo(0.5)
  })
})

describe('describeReflectivity', () => {
  it('names the model run, or says it is loading or unavailable', () => {
    expect(describeReflectivity('ok', Date.parse('2026-10-09T06:00:00Z'))).toBe('GFS simulated radar, 06Z run')
    expect(describeReflectivity('loading', null)).toBe('GFS simulated radar loading')
    expect(describeReflectivity('error', null)).toBe('GFS simulated radar unavailable')
  })
})
