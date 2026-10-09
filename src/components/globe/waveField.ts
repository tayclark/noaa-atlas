// Pure maths for the wave overlay (#229): sampling the GFS-Wave significant wave height grid,
// blending two forecast hours and colouring by height. waveOverlay.ts owns the canvas and calls
// into this. Land is NaN in the grid, so it samples as NaN and draws transparent.

import { sampleBlended, shadeScalarField, type ScalarFieldInput } from './fieldShading'

export type WaveFieldInput = ScalarFieldInput

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
export const sampleWaveHeight = sampleBlended

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

/** RGBA pixels (a Web Mercator image, `width` by `height`) shading the wave height; land is transparent. */
export function renderWaveShading(
  width: number,
  height: number,
  input: WaveFieldInput,
  alpha = 150,
): Uint8ClampedArray<ArrayBuffer> {
  return shadeScalarField(width, height, input, (out, i, h) => paint(out, i, h, alpha))
}
