// Pure maths for the wave overlay (#229): sampling the GFS-Wave significant wave height grid,
// blending two forecast hours and colouring by height. waveOverlay.ts owns the canvas and calls
// into this. Land is NaN in the grid, so it samples as NaN and draws transparent.

import type { GribField } from '../../data/grib2'
import { mercatorRowLat, sameGrid, sampleField } from './windField'

export interface WaveFieldInput {
  a: GribField
  b: GribField | null
  /** 0 at `a`, 1 at `b`. */
  t: number
}

// Height colour stops in metres: a sequential ramp that stays apart from the wind ramp's hues.
const STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [64, 120, 200]],
  [1, [48, 170, 190]],
  [2, [110, 200, 120]],
  [4, [235, 210, 80]],
  [6, [235, 140, 60]],
  [9, [200, 50, 70]],
  [12, [115, 30, 120]],
]

export const WAVE_LEGEND_STOPS_M: readonly number[] = STOPS.map(([height]) => height)

/** RGB for a wave height in metres, interpolated between the legend stops. */
export function waveColor(height: number): [number, number, number] {
  if (height <= STOPS[0][0]) return [...STOPS[0][1]]
  for (let i = 1; i < STOPS.length; i++) {
    const [h1, c1] = STOPS[i]
    if (height <= h1) {
      const [h0, c0] = STOPS[i - 1]
      const k = (height - h0) / (h1 - h0)
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number]
    }
  }
  return [...STOPS[STOPS.length - 1][1]]
}

/** Wave height between two forecast hours; `t` is 0 at `a` and 1 at `b`. NaN over land. */
export function sampleWaveHeight(input: WaveFieldInput, lat: number, lon: number): number {
  const ha = sampleField(input.a, lat, lon)
  if (!input.b || input.t <= 0 || Number.isNaN(ha)) return ha
  const hb = sampleField(input.b, lat, lon)
  return Number.isNaN(hb) ? ha : ha + (hb - ha) * input.t
}

// The paint covers about a million pixels per field (#314), so colours come from a table in
// LUT_STEPS_PER_M steps rather than from `waveColor`, which allocates on every call.
const LUT_STEPS_PER_M = 100
const LUT_SIZE = STOPS[STOPS.length - 1][0] * LUT_STEPS_PER_M + 1
const COLOR_LUT = new Uint8Array(LUT_SIZE * 3)
for (let k = 0; k < LUT_SIZE; k++) COLOR_LUT.set(waveColor(k / LUT_STEPS_PER_M), k * 3)

/** Fills one pixel from the colour table; `h` must not be NaN. */
function paint(out: Uint8ClampedArray, i: number, h: number, alpha: number): void {
  const k = Math.min(LUT_SIZE - 1, Math.max(0, Math.round(h * LUT_STEPS_PER_M))) * 3
  out[i] = COLOR_LUT[k]
  out[i + 1] = COLOR_LUT[k + 1]
  out[i + 2] = COLOR_LUT[k + 2]
  out[i + 3] = alpha
}

/**
 * RGBA pixels (a Web Mercator image, `width` by `height`) shading the wave height; land is
 * transparent. Matches `sampleWaveHeight` + `waveColor` per pixel, but works out the grid rows and
 * columns once per row and column instead of once per pixel (#314).
 */
export function renderWaveShading(
  width: number,
  height: number,
  input: WaveFieldInput,
  alpha = 150,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  const { a, b, t } = input
  const blend = b !== null && t > 0
  if (blend && !sameGrid(a, b)) {
    // Hours on different grids can't share the indices below; sample each pixel instead.
    for (let y = 0; y < height; y++) {
      const lat = mercatorRowLat((y + 0.5) / height)
      for (let x = 0; x < width; x++) {
        const h = sampleWaveHeight(input, lat, ((x + 0.5) / width) * 360 - 180)
        if (!Number.isNaN(h)) paint(out, (y * width + x) * 4, h, alpha)
      }
    }
    return out
  }

  // The same index maths as `sampleField`, split into its column and row halves.
  const c0s = new Int32Array(width)
  const c1s = new Int32Array(width)
  const fcs = new Float64Array(width)
  for (let x = 0; x < width; x++) {
    const lon = ((x + 0.5) / width) * 360 - 180
    const colF = (((lon - a.lon1) % 360) + 360) % 360 / a.di
    c0s[x] = Math.floor(colF) % a.ni
    c1s[x] = (c0s[x] + 1) % a.ni
    fcs[x] = colF - Math.floor(colF)
  }
  const av = a.values
  const bv = blend ? b.values : null
  for (let y = 0; y < height; y++) {
    const lat = mercatorRowLat((y + 0.5) / height)
    const row = Math.min(a.nj - 1, Math.max(0, (a.southToNorth ? lat - a.lat1 : a.lat1 - lat) / a.dj))
    const r0 = Math.floor(row)
    const top = r0 * a.ni
    const bottom = Math.min(a.nj - 1, r0 + 1) * a.ni
    const fr = row - r0
    for (let x = 0; x < width; x++) {
      const c0 = c0s[x]
      const c1 = c1s[x]
      const fc = fcs[x]
      const ha =
        (av[top + c0] * (1 - fc) + av[top + c1] * fc) * (1 - fr) +
        (av[bottom + c0] * (1 - fc) + av[bottom + c1] * fc) * fr
      if (Number.isNaN(ha)) continue
      let h = ha
      if (bv) {
        const hb =
          (bv[top + c0] * (1 - fc) + bv[top + c1] * fc) * (1 - fr) +
          (bv[bottom + c0] * (1 - fc) + bv[bottom + c1] * fc) * fr
        if (!Number.isNaN(hb)) h = ha + (hb - ha) * t
      }
      paint(out, (y * width + x) * 4, h, alpha)
    }
  }
  return out
}
