// Shading a GFS scalar field onto a Web Mercator canvas (#229, #340): the per-row and per-column index
// maths behind the wave and simulated radar overlays, with two forecast hours blended. Each overlay
// supplies only how one value is painted. Pure, so it's unit-tested through its callers.

import type { GribField } from '../../data/grib2'
import { mercatorRowLat, sameGrid, sampleField } from './windField'

export interface ScalarFieldInput {
  a: GribField
  b: GribField | null
  /** 0 at `a`, 1 at `b`. */
  t: number
}

/** Paints one pixel at byte offset `i` for value `v` (never NaN), or leaves it transparent. */
export type PaintValue = (out: Uint8ClampedArray, i: number, v: number) => void

/** The value between two forecast hours; `t` is 0 at `a` and 1 at `b`. NaN where `a` has no value. */
export function sampleBlended(input: ScalarFieldInput, lat: number, lon: number): number {
  const va = sampleField(input.a, lat, lon)
  if (!input.b || input.t <= 0 || Number.isNaN(va)) return va
  const vb = sampleField(input.b, lat, lon)
  return Number.isNaN(vb) ? va : va + (vb - va) * input.t
}

/**
 * RGBA pixels (a Web Mercator image, `width` by `height`) of the field, painted by `paint`; NaN cells
 * stay transparent. Matches `sampleBlended` per pixel, but works out the grid rows and columns once
 * per row and column instead of once per pixel (#314).
 */
export function shadeScalarField(width: number, height: number, input: ScalarFieldInput, paint: PaintValue): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  const { a, b, t } = input
  const blend = b !== null && t > 0
  if (blend && !sameGrid(a, b)) {
    // Hours on different grids can't share the indices below; sample each pixel instead.
    for (let y = 0; y < height; y++) {
      const lat = mercatorRowLat((y + 0.5) / height)
      for (let x = 0; x < width; x++) {
        const v = sampleBlended(input, lat, ((x + 0.5) / width) * 360 - 180)
        if (!Number.isNaN(v)) paint(out, (y * width + x) * 4, v)
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
      const va =
        (av[top + c0] * (1 - fc) + av[top + c1] * fc) * (1 - fr) +
        (av[bottom + c0] * (1 - fc) + av[bottom + c1] * fc) * fr
      if (Number.isNaN(va)) continue
      let v = va
      if (bv) {
        const vb =
          (bv[top + c0] * (1 - fc) + bv[top + c1] * fc) * (1 - fr) +
          (bv[bottom + c0] * (1 - fc) + bv[bottom + c1] * fc) * fr
        if (!Number.isNaN(vb)) v = va + (vb - va) * t
      }
      paint(out, (y * width + x) * 4, v)
    }
  }
  return out
}
