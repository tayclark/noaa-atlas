// Pure maths for the wave overlay (#229): sampling the GFS-Wave significant wave height grid,
// blending two forecast hours and colouring by height. waveOverlay.ts owns the canvas and calls
// into this. Land is NaN in the grid, so it samples as NaN and draws transparent.

import type { GribField } from '../../data/grib2'
import { mercatorRowLat, sampleField } from './windField'

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

/** RGBA pixels (a Web Mercator image, `width` by `height`) shading the wave height; land is transparent. */
export function renderWaveShading(
  width: number,
  height: number,
  heightAt: (lat: number, lon: number) => number,
  alpha = 150,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const lat = mercatorRowLat((y + 0.5) / height)
    for (let x = 0; x < width; x++) {
      const h = heightAt(lat, ((x + 0.5) / width) * 360 - 180)
      if (Number.isNaN(h)) continue
      const [r, g, b] = waveColor(h)
      const i = (y * width + x) * 4
      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
      out[i + 3] = alpha
    }
  }
  return out
}
