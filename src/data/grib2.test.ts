import fixtureB64 from './fixtures/gfs-ugrd10m-f012.grib2.b64?raw'
import { describe, expect, it } from 'vitest'
import { decodeGribField, Grib2Error } from './grib2'

// The real GFS 1 degree 10 m UGRD message (cycle 2026-10-01 00z, f012), stored as base64 text.
const fixture = () => {
  const bin = atob(fixtureB64.trim())
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

describe('decodeGribField', () => {
  it('decodes the GFS 10 m U wind (template 5.3) into a plausible global field', () => {
    const f = decodeGribField(fixture())
    expect([f.ni, f.nj]).toEqual([360, 181])
    expect(f.lat1).toBe(90)
    expect(f.lon1).toBe(0)
    expect(f.di).toBe(1)
    expect(f.southToNorth).toBe(false)
    let min = Infinity
    let max = -Infinity
    for (const v of f.values) {
      expect(Number.isNaN(v)).toBe(false)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    expect(min).toBeGreaterThan(-60)
    expect(max).toBeLessThan(60)
    expect(max - min).toBeGreaterThan(15)
    // Zonal means: roaring-forties westerlies at 50S, trade-wind easterlies at 15N.
    const mean = (lat: number) => {
      const row = Math.round((f.lat1 - lat) / f.dj)
      let sum = 0
      for (let x = 0; x < f.ni; x++) sum += f.values[row * f.ni + x]
      return sum / f.ni
    }
    expect(mean(-50)).toBeGreaterThan(4)
    expect(mean(15)).toBeLessThan(0)
  })

  it('rejects bytes that are not GRIB2', () => {
    expect(() => decodeGribField(new Uint8Array(40))).toThrow(Grib2Error)
  })

  it('rejects a data template it cannot decode', () => {
    const bytes = fixture()
    // Find section 5 and change its template number to 40 (JPEG 2000).
    let at = 16
    const view = new DataView(bytes.buffer)
    while (bytes[at + 4] !== 5) at += view.getUint32(at)
    view.setUint16(at + 9, 40)
    expect(() => decodeGribField(bytes)).toThrow(/data template 5\.40/)
  })
})
