// Pure maths for the wind overlay (#229): sampling the GFS 10 m wind grid, blending two forecast
// hours, colouring by speed and advecting particles. windOverlay.ts owns the canvas and MapLibre
// sources and calls into this.

import type { GribField } from '../../data/grib2'

export interface WindGrid {
  u: GribField
  v: GribField
}

export interface WindFieldInput {
  a: WindGrid
  b: WindGrid | null
  /** 0 at `a`, 1 at `b`. */
  t: number
}

export interface Wind {
  /** Eastward and northward components, m/s. */
  u: number
  v: number
}

const WEB_MERCATOR_MAX_LAT = 85.0511

export const METERS_PER_DEGREE = 111_320

/** True when two fields share a grid, so one set of row and column indices serves both. */
export function sameGrid(a: GribField, b: GribField): boolean {
  return (
    a.ni === b.ni && a.nj === b.nj && a.lat1 === b.lat1 && a.lon1 === b.lon1 &&
    a.di === b.di && a.dj === b.dj && a.southToNorth === b.southToNorth
  )
}

export function sampleField(f: GribField, lat: number, lon: number): number {
  // Row 0 is the first latitude; rows step by `dj` toward the south unless `southToNorth`.
  const rowF = (f.southToNorth ? lat - f.lat1 : f.lat1 - lat) / f.dj
  const colF = (((lon - f.lon1) % 360) + 360) % 360 / f.di
  const row = Math.min(f.nj - 1, Math.max(0, rowF))
  const r0 = Math.floor(row)
  const r1 = Math.min(f.nj - 1, r0 + 1)
  const c0 = Math.floor(colF) % f.ni
  const c1 = (c0 + 1) % f.ni
  const fr = row - r0
  const fc = colF - Math.floor(colF)
  const at = (r: number, c: number) => f.values[r * f.ni + c]
  const top = at(r0, c0) * (1 - fc) + at(r0, c1) * fc
  const bottom = at(r1, c0) * (1 - fc) + at(r1, c1) * fc
  return top * (1 - fr) + bottom * fr
}

/** Bilinear wind at a point; longitude wraps around the globe. */
export function sampleWind(grid: WindGrid, lat: number, lon: number): Wind {
  return { u: sampleField(grid.u, lat, lon), v: sampleField(grid.v, lat, lon) }
}

/** Wind between two forecast hours; `t` is 0 at `a` and 1 at `b`. */
export function sampleBlended(a: WindGrid, b: WindGrid | null, t: number, lat: number, lon: number): Wind {
  const wa = sampleWind(a, lat, lon)
  if (!b || t <= 0) return wa
  const wb = sampleWind(b, lat, lon)
  return { u: wa.u + (wb.u - wa.u) * t, v: wa.v + (wb.v - wa.v) * t }
}

export function windSpeed(w: Wind): number {
  return Math.hypot(w.u, w.v)
}

// Speed colour stops in m/s, light to dark so the shading stays legible over both land and sea.
const STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [98, 113, 183]],
  [5, [61, 160, 213]],
  [10, [80, 190, 150]],
  [15, [225, 200, 70]],
  [20, [232, 130, 50]],
  [30, [205, 50, 50]],
]

export const WIND_LEGEND_STOPS_MS: readonly number[] = STOPS.map(([speed]) => speed)

/** RGB for a wind speed in m/s, interpolated between the legend stops. */
export function windColor(speed: number): [number, number, number] {
  if (speed <= STOPS[0][0]) return [...STOPS[0][1]]
  for (let i = 1; i < STOPS.length; i++) {
    const [s1, c1] = STOPS[i]
    if (speed <= s1) {
      const [s0, c0] = STOPS[i - 1]
      const k = (speed - s0) / (s1 - s0)
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number]
    }
  }
  return [...STOPS[STOPS.length - 1][1]]
}

export function metersPerSecondToKnots(ms: number): number {
  return ms * 1.943844
}

/** Latitude of a Web Mercator image row, `y` in 0..1 from the top. */
export function mercatorRowLat(y: number): number {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
  return Math.max(-WEB_MERCATOR_MAX_LAT, Math.min(WEB_MERCATOR_MAX_LAT, lat))
}

/** Inverse of `mercatorRowLat`: the row (0..1 from the top) for a latitude. */
export function latToMercatorRow(lat: number): number {
  const clamped = Math.max(-WEB_MERCATOR_MAX_LAT, Math.min(WEB_MERCATOR_MAX_LAT, lat))
  const rad = (clamped * Math.PI) / 180
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2
}

// The paint covers about a quarter of a million pixels per field and reruns on every slider step
// (#316), so colours come from a table in LUT_STEPS_PER_MS steps rather than from `windColor`,
// which allocates on every call.
const LUT_STEPS_PER_MS = 100
const LUT_SIZE = STOPS[STOPS.length - 1][0] * LUT_STEPS_PER_MS + 1
const COLOR_LUT = new Uint8Array(LUT_SIZE * 3)
for (let k = 0; k < LUT_SIZE; k++) COLOR_LUT.set(windColor(k / LUT_STEPS_PER_MS), k * 3)

/** Fills one pixel from the colour table. NaN takes the last colour, as it does in `windColor`. */
function paint(out: Uint8ClampedArray, i: number, speed: number, alpha: number): void {
  const step = Number.isNaN(speed) ? LUT_SIZE - 1 : Math.round(speed * LUT_STEPS_PER_MS)
  const k = Math.min(LUT_SIZE - 1, Math.max(0, step)) * 3
  out[i] = COLOR_LUT[k]
  out[i + 1] = COLOR_LUT[k + 1]
  out[i + 2] = COLOR_LUT[k + 2]
  out[i + 3] = alpha
}

/**
 * RGBA pixels (a Web Mercator image, `width` by `height`) shading the wind speed. Matches
 * `sampleBlended` + `windColor` per pixel, but works out the grid rows and columns once per row
 * and column instead of four times per pixel (#316).
 */
export function renderSpeedShading(
  width: number,
  height: number,
  input: WindFieldInput,
  alpha = 90,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  const { a, b, t } = input
  const blend = b !== null && t > 0
  const g = a.u
  if (!sameGrid(g, a.v) || (blend && (!sameGrid(g, b.u) || !sameGrid(g, b.v)))) {
    // Fields on different grids can't share the indices below; sample each pixel instead.
    for (let y = 0; y < height; y++) {
      const lat = mercatorRowLat((y + 0.5) / height)
      for (let x = 0; x < width; x++) {
        const w = sampleBlended(a, b, t, lat, ((x + 0.5) / width) * 360 - 180)
        paint(out, (y * width + x) * 4, windSpeed(w), alpha)
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
    const colF = (((lon - g.lon1) % 360) + 360) % 360 / g.di
    c0s[x] = Math.floor(colF) % g.ni
    c1s[x] = (c0s[x] + 1) % g.ni
    fcs[x] = colF - Math.floor(colF)
  }
  const au = a.u.values
  const av = a.v.values
  const bu = blend ? b.u.values : null
  const bv = blend ? b.v.values : null
  for (let y = 0; y < height; y++) {
    const lat = mercatorRowLat((y + 0.5) / height)
    const row = Math.min(g.nj - 1, Math.max(0, (g.southToNorth ? lat - g.lat1 : g.lat1 - lat) / g.dj))
    const r0 = Math.floor(row)
    const top = r0 * g.ni
    const bottom = Math.min(g.nj - 1, r0 + 1) * g.ni
    const fr = row - r0
    for (let x = 0; x < width; x++) {
      const c0 = c0s[x]
      const c1 = c1s[x]
      const fc = fcs[x]
      let u =
        (au[top + c0] * (1 - fc) + au[top + c1] * fc) * (1 - fr) +
        (au[bottom + c0] * (1 - fc) + au[bottom + c1] * fc) * fr
      let v =
        (av[top + c0] * (1 - fc) + av[top + c1] * fc) * (1 - fr) +
        (av[bottom + c0] * (1 - fc) + av[bottom + c1] * fc) * fr
      if (bu && bv) {
        const ub =
          (bu[top + c0] * (1 - fc) + bu[top + c1] * fc) * (1 - fr) +
          (bu[bottom + c0] * (1 - fc) + bu[bottom + c1] * fc) * fr
        const vb =
          (bv[top + c0] * (1 - fc) + bv[top + c1] * fc) * (1 - fr) +
          (bv[bottom + c0] * (1 - fc) + bv[bottom + c1] * fc) * fr
        u += (ub - u) * t
        v += (vb - v) * t
      }
      paint(out, (y * width + x) * 4, Math.hypot(u, v), alpha)
    }
  }
  return out
}

export interface Particle {
  lat: number
  lon: number
  /** Frames left before it respawns. */
  life: number
}

export const PARTICLE_MAX_LIFE = 90

/** A tiny deterministic generator, so tests and screenshots are repeatable. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A particle at a random spot (uniform in Mercator space, so the screen density is even). */
export function spawnParticle(random: () => number, life = Math.floor(random() * PARTICLE_MAX_LIFE) + 1): Particle {
  return { lat: mercatorRowLat(random()), lon: random() * 360 - 180, life }
}

/**
 * Moves a particle for one frame. `secondsPerFrame` is how much wind time one frame stands for (it
 * sets the visual speed). Returns false when the particle has died and was respawned.
 */
export function advanceParticle(
  p: Particle,
  wind: Wind,
  secondsPerFrame: number,
  random: () => number,
): boolean {
  const cosLat = Math.max(0.05, Math.cos((p.lat * Math.PI) / 180))
  const nextLat = p.lat + ((wind.v * secondsPerFrame) / METERS_PER_DEGREE)
  const nextLon = p.lon + ((wind.u * secondsPerFrame) / (METERS_PER_DEGREE * cosLat))
  p.life -= 1
  if (p.life <= 0 || Math.abs(nextLat) > WEB_MERCATOR_MAX_LAT) {
    Object.assign(p, spawnParticle(random, PARTICLE_MAX_LIFE))
    return false
  }
  p.lat = nextLat
  p.lon = ((((nextLon + 180) % 360) + 360) % 360) - 180
  return true
}
