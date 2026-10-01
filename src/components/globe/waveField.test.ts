import { describe, expect, it } from 'vitest'
import type { GribField } from '../../data/grib2'
import { renderWaveShading, sampleWaveHeight, waveColor, WAVE_LEGEND_STOPS_M } from './waveField'

// A 4 x 3 grid from 10N to 10S, 0 to 270E in 90 degree steps. The top row is land (NaN).
const grid = (fill: number): GribField => ({
  ni: 4,
  nj: 3,
  lat1: 10,
  lon1: 0,
  di: 90,
  dj: 10,
  southToNorth: false,
  values: Float32Array.from([NaN, NaN, NaN, NaN, fill, fill, fill, fill, fill, fill, fill, fill]),
})

describe('waveColor', () => {
  it('returns the stop colours and clamps beyond the ends', () => {
    expect(waveColor(0)).toEqual(waveColor(-3))
    expect(waveColor(12)).toEqual(waveColor(40))
    expect(waveColor(WAVE_LEGEND_STOPS_M[2])).toEqual([110, 200, 120])
  })

  it('interpolates between stops', () => {
    expect(waveColor(0.5)).toEqual([56, 145, 195])
  })
})

describe('sampleWaveHeight', () => {
  it('blends two hours and keeps land as NaN', () => {
    const input = { a: grid(2), b: grid(4), t: 0.25 }
    expect(sampleWaveHeight(input, 0, 90)).toBeCloseTo(2.5)
    expect(sampleWaveHeight(input, 10, 90)).toBeNaN()
  })

  it('falls back to the first hour where the second is missing', () => {
    const input = { a: grid(2), b: { ...grid(4), values: new Float32Array(12).fill(NaN) }, t: 0.5 }
    expect(sampleWaveHeight(input, 0, 90)).toBe(2)
  })
})

describe('renderWaveShading', () => {
  it('draws sea opaque-ish and leaves land transparent', () => {
    const px = renderWaveShading(2, 2, (lat) => (lat > 0 ? NaN : 3), 150)
    expect(px[3]).toBe(0)
    expect(px[7]).toBe(0)
    expect(px[11]).toBe(150)
    expect(Array.from(px.slice(8, 11))).toEqual(waveColor(3))
  })
})
