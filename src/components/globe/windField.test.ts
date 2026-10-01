import { describe, expect, it } from 'vitest'
import type { GribField } from '../../data/grib2'
import {
  advanceParticle,
  latToMercatorRow,
  makeRandom,
  mercatorRowLat,
  renderSpeedShading,
  sampleBlended,
  sampleWind,
  spawnParticle,
  windColor,
  windSpeed,
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

describe('renderSpeedShading', () => {
  it('fills every pixel with the speed colour and the given alpha', () => {
    const px = renderSpeedShading(2, 2, () => ({ u: 30, v: 0 }), 50)
    expect(px).toHaveLength(16)
    expect([...px.slice(0, 4)]).toEqual([205, 50, 50, 50])
    expect([...px.slice(12, 16)]).toEqual([205, 50, 50, 50])
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
