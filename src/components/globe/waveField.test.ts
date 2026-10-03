import { describe, expect, it } from 'vitest'
import type { GribField } from '../../data/grib2'
import { renderWaveShading, sampleWaveHeight, waveColor, WAVE_LEGEND_STOPS_M, type WaveFieldInput } from './waveField'
import { mercatorRowLat } from './windField'

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

// The shading as it was painted before #314: `sampleWaveHeight` and `waveColor` for every pixel.
function referenceShading(width: number, height: number, input: WaveFieldInput, alpha = 150): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const lat = mercatorRowLat((y + 0.5) / height)
    for (let x = 0; x < width; x++) {
      const h = sampleWaveHeight(input, lat, ((x + 0.5) / width) * 360 - 180)
      if (Number.isNaN(h)) continue
      out.set([...waveColor(h), alpha], (y * width + x) * 4)
    }
  }
  return out
}

// A grid of varied heights from 0 to about 14 m, with NaN land cells where `land(i)` is true.
function field(ni: number, nj: number, seed: number, land: (i: number) => boolean, extra: Partial<GribField> = {}): GribField {
  const values = new Float32Array(ni * nj)
  for (let i = 0; i < values.length; i++) values[i] = land(i) ? NaN : Math.abs(Math.sin(i * 0.37 + seed)) * 14
  return { ni, nj, lat1: 80, lon1: 0, di: 360 / ni, dj: 160 / (nj - 1), southToNorth: false, values, ...extra }
}

function expectMatches(actual: Uint8ClampedArray, expected: Uint8ClampedArray): void {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++) {
    // Alpha must agree exactly (land stays land); colours may differ by the table's rounding.
    if (i % 4 === 3) expect(actual[i], `alpha at ${i}`).toBe(expected[i])
    else expect(Math.abs(actual[i] - expected[i]), `channel at ${i}`).toBeLessThanOrEqual(1)
  }
}

describe('renderWaveShading', () => {
  it('draws sea opaque-ish and leaves land transparent', () => {
    const px = renderWaveShading(2, 2, { a: grid(3), b: null, t: 0 }, 150)
    expect(px[3]).toBe(0)
    expect(px[7]).toBe(0)
    expect(px[11]).toBe(150)
    expect(Array.from(px.slice(8, 11))).toEqual(waveColor(3))
  })

  const a = field(36, 17, 0, (i) => i % 7 === 0)
  const b = field(36, 17, 1.3, (i) => i % 5 === 0)

  it.each([0, 0.4, 1])('matches the per-pixel shading when blending at t = %s', (t) => {
    const input = { a, b, t }
    expectMatches(renderWaveShading(64, 48, input), referenceShading(64, 48, input))
  })

  it('matches the per-pixel shading for a single hour', () => {
    const input = { a, b: null, t: 0.5 }
    expectMatches(renderWaveShading(64, 48, input), referenceShading(64, 48, input))
  })

  it('wraps longitude for a grid starting off the antimeridian', () => {
    const input = { a: field(36, 17, 2, () => false, { lon1: 175 }), b: null, t: 0 }
    expectMatches(renderWaveShading(72, 8, input), referenceShading(72, 8, input))
  })

  it('reads a south-to-north grid', () => {
    const input = { a: field(36, 17, 3, (i) => i < 36, { lat1: -80, southToNorth: true }), b: null, t: 0 }
    expectMatches(renderWaveShading(32, 32, input), referenceShading(32, 32, input))
  })

  it('samples each pixel when the two hours are on different grids', () => {
    const input = { a, b: field(72, 33, 4, () => false), t: 0.6 }
    expectMatches(renderWaveShading(40, 30, input), referenceShading(40, 30, input))
  })

  it('takes the colour ends past the legend range', () => {
    const low = renderWaveShading(1, 1, { a: { ...grid(-1), nj: 1, lat1: 0, values: Float32Array.from([-1, -1, -1, -1]) }, b: null, t: 0 })
    const high = renderWaveShading(1, 1, { a: { ...grid(30), nj: 1, lat1: 0, values: Float32Array.from([30, 30, 30, 30]) }, b: null, t: 0 })
    expect(Array.from(low.slice(0, 3))).toEqual(waveColor(0))
    expect(Array.from(high.slice(0, 3))).toEqual(waveColor(12))
  })
})
