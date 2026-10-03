import { describe, expect, it } from 'vitest'
import type { GribField } from '../../data/grib2'
import {
  advanceParticle,
  latToMercatorRow,
  makeRandom,
  makeWindSampler,
  mercatorRowLat,
  renderSpeedShading,
  sampleBlended,
  sampleWind,
  spawnParticle,
  stepSwarm,
  swarmRows,
  windColor,
  windSpeed,
  type Particle,
  type Wind,
  type WindFieldInput,
  type WindGrid,
} from './windField'

// A 4 x 3 grid (lon 0, 90, 180, 270; lat 90, 0, -90) whose u equals the column and v the row.
function grid(southToNorth = false): WindGrid {
  const make = (f: (r: number, c: number) => number): GribField => ({
    ni: 4,
    nj: 3,
    lat1: southToNorth ? -90 : 90,
    lon1: 0,
    di: 90,
    dj: 90,
    southToNorth,
    values: Float32Array.from({ length: 12 }, (_, i) => f(Math.floor(i / 4), i % 4)),
  })
  return { u: make((_, c) => c * 10), v: make((r) => r * 10) }
}

describe('sampleWind', () => {
  it('returns grid values at nodes and interpolates between them', () => {
    const g = grid()
    expect(sampleWind(g, 90, 90)).toEqual({ u: 10, v: 0 })
    expect(sampleWind(g, 0, 0)).toEqual({ u: 0, v: 10 })
    const mid = sampleWind(g, 45, 45)
    expect(mid.u).toBeCloseTo(5)
    expect(mid.v).toBeCloseTo(5)
  })

  it('wraps longitude, including past the last column and negative values', () => {
    const g = grid()
    expect(sampleWind(g, 90, -90).u).toBeCloseTo(30)
    expect(sampleWind(g, 90, 315).u).toBeCloseTo(15)
  })

  it('handles a south-to-north grid', () => {
    expect(sampleWind(grid(true), -90, 0).v).toBe(0)
    expect(sampleWind(grid(true), 0, 0).v).toBe(10)
  })

  it('clamps latitudes beyond the grid rows', () => {
    expect(sampleWind(grid(), 120, 0).v).toBe(0)
  })
})

describe('sampleBlended', () => {
  const a = grid()
  const b: WindGrid = { u: { ...a.u, values: a.u.values.map((x) => x + 10) }, v: a.v }

  it('moves from a to b with t', () => {
    expect(sampleBlended(a, b, 0, 90, 0).u).toBe(0)
    expect(sampleBlended(a, b, 0.5, 90, 0).u).toBeCloseTo(5)
    expect(sampleBlended(a, b, 1, 90, 0).u).toBe(10)
  })

  it('uses the first grid alone when there is no second', () => {
    expect(sampleBlended(a, null, 0.7, 90, 90).u).toBe(10)
  })
})

describe('colour and speed', () => {
  it('computes speed', () => expect(windSpeed({ u: 3, v: 4 })).toBe(5))

  it('hits the stops, interpolates between them and clamps', () => {
    expect(windColor(0)).toEqual([98, 113, 183])
    expect(windColor(-3)).toEqual([98, 113, 183])
    expect(windColor(30)).toEqual([205, 50, 50])
    expect(windColor(99)).toEqual([205, 50, 50])
    expect(windColor(2.5)).toEqual([80, 137, 198])
  })
})

describe('mercator rows', () => {
  it('round-trips latitude and row', () => {
    for (const lat of [-80, -30, 0, 45, 80]) expect(mercatorRowLat(latToMercatorRow(lat))).toBeCloseTo(lat, 5)
    expect(mercatorRowLat(0.5)).toBeCloseTo(0)
  })

  it('clamps beyond the Web Mercator limit', () => {
    expect(mercatorRowLat(-1)).toBeCloseTo(85.0511)
    expect(latToMercatorRow(90)).toBeCloseTo(0, 3)
  })
})

// The shading as it was painted before #316: `sampleBlended` and `windColor` for every pixel.
function referenceShading(width: number, height: number, input: WindFieldInput, alpha = 90): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const lat = mercatorRowLat((y + 0.5) / height)
    for (let x = 0; x < width; x++) {
      const w = sampleBlended(input.a, input.b, input.t, lat, ((x + 0.5) / width) * 360 - 180)
      out.set([...windColor(windSpeed(w)), alpha], (y * width + x) * 4)
    }
  }
  return out
}

// u and v grids of varied winds from about -25 to 25 m/s per component, so speeds pass 30 m/s.
function windGrid(ni: number, nj: number, seed: number, extra: Partial<GribField> = {}): WindGrid {
  const make = (phase: number): GribField => {
    const values = new Float32Array(ni * nj)
    for (let i = 0; i < values.length; i++) values[i] = Math.sin(i * 0.37 + seed + phase) * 25
    return { ni, nj, lat1: 80, lon1: 0, di: 360 / ni, dj: 160 / (nj - 1), southToNorth: false, values, ...extra }
  }
  return { u: make(0), v: make(1.7) }
}

function uniform(u: number, v: number): WindGrid {
  const make = (value: number): GribField => ({
    ni: 4, nj: 1, lat1: 0, lon1: 0, di: 90, dj: 1, southToNorth: false, values: new Float32Array(4).fill(value),
  })
  return { u: make(u), v: make(v) }
}

function expectMatches(actual: Uint8ClampedArray, expected: Uint8ClampedArray): void {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++) {
    // Alpha must agree exactly; colours may differ by the table's rounding.
    if (i % 4 === 3) expect(actual[i], `alpha at ${i}`).toBe(expected[i])
    else expect(Math.abs(actual[i] - expected[i]), `channel at ${i}`).toBeLessThanOrEqual(1)
  }
}

describe('renderSpeedShading', () => {
  it('fills every pixel with the speed colour and the given alpha', () => {
    const px = renderSpeedShading(2, 2, { a: uniform(30, 0), b: null, t: 0 }, 50)
    expect(px).toHaveLength(16)
    expect([...px.slice(0, 4)]).toEqual([205, 50, 50, 50])
    expect([...px.slice(12, 16)]).toEqual([205, 50, 50, 50])
  })

  const a = windGrid(36, 17, 0)
  const b = windGrid(36, 17, 1.3)

  it.each([0, 0.4, 1])('matches the per-pixel shading when blending at t = %s', (t) => {
    const input = { a, b, t }
    expectMatches(renderSpeedShading(64, 48, input), referenceShading(64, 48, input))
  })

  it('matches the per-pixel shading for a single hour', () => {
    const input = { a, b: null, t: 0.5 }
    expectMatches(renderSpeedShading(64, 48, input), referenceShading(64, 48, input))
  })

  it('wraps longitude for a grid starting off the antimeridian', () => {
    const input = { a: windGrid(36, 17, 2, { lon1: 175 }), b: null, t: 0 }
    expectMatches(renderSpeedShading(72, 8, input), referenceShading(72, 8, input))
  })

  it('reads a south-to-north grid', () => {
    const input = { a: windGrid(36, 17, 3, { lat1: -80, southToNorth: true }), b: null, t: 0 }
    expectMatches(renderSpeedShading(32, 32, input), referenceShading(32, 32, input))
  })

  it('samples each pixel when the two hours are on different grids', () => {
    const input = { a, b: windGrid(72, 33, 4), t: 0.6 }
    expectMatches(renderSpeedShading(40, 30, input), referenceShading(40, 30, input))
  })

  it('samples each pixel when u and v are on different grids', () => {
    const input = { a: { u: a.u, v: windGrid(72, 33, 5).v }, b: null, t: 0 }
    expectMatches(renderSpeedShading(40, 30, input), referenceShading(40, 30, input))
  })

  it('takes the colour ends past the legend range, and the last colour for NaN', () => {
    const shade = (grid: WindGrid) => Array.from(renderSpeedShading(1, 1, { a: grid, b: null, t: 0 }).slice(0, 3))
    expect(shade(uniform(0, 0))).toEqual(windColor(0))
    expect(shade(uniform(40, -30))).toEqual(windColor(30))
    expect(shade(uniform(NaN, 0))).toEqual(windColor(NaN))
  })
})

describe('particles', () => {
  it('spawns inside the Mercator bounds with a seeded generator', () => {
    const r = makeRandom(1)
    for (let i = 0; i < 50; i++) {
      const p = spawnParticle(r)
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(85.0511)
      expect(p.lon).toBeGreaterThanOrEqual(-180)
      expect(p.lon).toBeLessThan(180)
    }
    expect(makeRandom(7)()).toBe(makeRandom(7)())
  })

  it('moves with the wind, stretching longitude toward the poles', () => {
    const eq = { lat: 0, lon: 0, life: 10 }
    const high = { lat: 60, lon: 0, life: 10 }
    advanceParticle(eq, { u: 10, v: 0 }, 3600, makeRandom(1))
    advanceParticle(high, { u: 10, v: 0 }, 3600, makeRandom(1))
    expect(eq.lon).toBeCloseTo(0.3234, 3)
    expect(high.lon).toBeCloseTo(0.6468, 3)
    const north = { lat: 0, lon: 0, life: 10 }
    advanceParticle(north, { u: 0, v: 10 }, 3600, makeRandom(1))
    expect(north.lat).toBeCloseTo(0.3234, 3)
  })

  it('wraps across the antimeridian', () => {
    const p = { lat: 0, lon: 179.9, life: 10 }
    advanceParticle(p, { u: 10, v: 0 }, 3600, makeRandom(1))
    expect(p.lon).toBeCloseTo(-179.7766, 3)
  })

  it('respawns when its life runs out or it leaves the map', () => {
    const old = { lat: 0, lon: 0, life: 1 }
    expect(advanceParticle(old, { u: 1, v: 1 }, 60, makeRandom(2))).toBe(false)
    expect(old.life).toBe(90)
    const polar = { lat: 85, lon: 0, life: 50 }
    expect(advanceParticle(polar, { u: 0, v: 50 }, 3600, makeRandom(3))).toBe(false)
    expect(Math.abs(polar.lat)).toBeLessThan(85.0511)
  })
})

describe('makeWindSampler', () => {
  const a = windGrid(36, 17, 0)
  const b = windGrid(36, 17, 1.3)

  // Every point is compared exactly: the sampler must not change a single particle path.
  function expectSameAsBlended(input: WindFieldInput): void {
    const sample = makeWindSampler(input)
    const out: Wind = { u: 0, v: 0 }
    for (let lat = -89; lat <= 89; lat += 7.3) {
      for (let lon = -200; lon <= 200; lon += 11.7) {
        sample(lat, lon, out)
        const w = sampleBlended(input.a, input.b, input.t, lat, lon)
        expect(out.u, `u at ${lat}, ${lon}`).toBe(w.u)
        expect(out.v, `v at ${lat}, ${lon}`).toBe(w.v)
      }
    }
  }

  it.each([0, 0.3, 1])('matches sampleBlended when blending at t = %s', (t) => expectSameAsBlended({ a, b, t }))
  it('matches sampleBlended for a single hour', () => expectSameAsBlended({ a, b: null, t: 0.5 }))
  it('matches sampleBlended off the antimeridian', () =>
    expectSameAsBlended({ a: windGrid(36, 17, 2, { lon1: 175 }), b: null, t: 0 }))
  it('matches sampleBlended on a south-to-north grid', () =>
    expectSameAsBlended({ a: windGrid(36, 17, 3, { lat1: -80, southToNorth: true }), b: null, t: 0 }))
  it('falls back to sampleBlended across different grids', () => {
    expectSameAsBlended({ a, b: windGrid(72, 33, 4), t: 0.6 })
    expectSameAsBlended({ a: { u: a.u, v: windGrid(72, 33, 5).v }, b: null, t: 0 })
  })
})

describe('stepSwarm', () => {
  const SIZE = 1024
  const SECONDS = 4500
  type Segment = [number, number, number, number]

  function makeSwarm(seed: number, count: number): { swarm: Particle[]; random: () => number } {
    const random = makeRandom(seed)
    return { swarm: Array.from({ length: count }, () => spawnParticle(random)), random }
  }

  // The streak loop as it was before #318: sampleBlended and two projections per particle.
  function referenceFrame(swarm: Particle[], input: WindFieldInput, random: () => number): Segment[] {
    const segments: Segment[] = []
    const px = (lon: number) => ((lon + 180) / 360) * SIZE
    const py = (lat: number) => latToMercatorRow(lat) * SIZE
    for (const p of swarm) {
      const x0 = px(p.lon)
      const y0 = py(p.lat)
      const moved = advanceParticle(p, sampleBlended(input.a, input.b, input.t, p.lat, p.lon), SECONDS, random)
      const x1 = px(p.lon)
      if (!moved || Math.abs(x1 - x0) > SIZE / 2) continue
      segments.push([x0, y0, x1, py(p.lat)])
    }
    return segments
  }

  it('draws exactly the streaks of the per-particle loop', () => {
    const input = { a: windGrid(36, 17, 0), b: windGrid(36, 17, 1.3), t: 0.4 }
    const ref = makeSwarm(229, 300)
    const fast = makeSwarm(229, 300)
    const rows = swarmRows(fast.swarm, SIZE)
    const sample = makeWindSampler(input)
    for (let frame = 0; frame < 40; frame++) {
      const segments: Segment[] = []
      stepSwarm(fast.swarm, rows, sample, SECONDS, fast.random, SIZE, (...s) => segments.push(s))
      expect(segments, `frame ${frame}`).toEqual(referenceFrame(ref.swarm, input, ref.random))
    }
    expect(fast.swarm).toEqual(ref.swarm)
  })

  it('skips respawns and antimeridian wraps but keeps each row current', () => {
    const swarm: Particle[] = [
      { lat: 0, lon: 179.9, life: 10 },
      { lat: 10, lon: 0, life: 1 },
      { lat: 20, lon: 0, life: 10 },
    ]
    const rows = swarmRows(swarm, SIZE)
    const segments: Segment[] = []
    const eastward = makeWindSampler({ a: uniform(10, 0), b: null, t: 0 })
    stepSwarm(swarm, rows, eastward, 3600, makeRandom(1), SIZE, (...s) => segments.push(s))
    expect(segments).toHaveLength(1)
    expect(segments[0][0]).toBeCloseTo(512, 6)
    swarm.forEach((p, i) => expect(rows[i]).toBe(latToMercatorRow(p.lat) * SIZE))
  })
})
