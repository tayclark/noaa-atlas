import fixtureB64 from './fixtures/gfs-ugrd10m-f012.grib2.b64?raw'
import { describe, expect, it } from 'vitest'
import waveB64 from './fixtures/gfswave-htsgw-f024.grib2.b64?raw'
import { decodeGribField, decodeGribFieldAsync, Grib2Error } from './grib2'

// The real GFS 1 degree 10 m UGRD message (cycle 2026-10-01 00z, f012), stored as base64 text.
const fixture = () => {
  const bin = atob(fixtureB64.trim())
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const decode = (b64: string) => Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0))

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

describe('decodeGribFieldAsync', () => {
  // The real GFS-Wave 0.25 degree HTSGW message (cycle 2026-09-30 00z, f024): template 5.40 plus a land bitmap.
  it('decodes JPEG 2000 wave heights and masks land with NaN', async () => {
    const f = await decodeGribFieldAsync(decode(waveB64))
    expect([f.ni, f.nj]).toEqual([1440, 721])
    expect(f.lat1).toBe(90)
    expect(f.di).toBe(0.25)
    expect(f.southToNorth).toBe(false)
    let present = 0
    let max = 0
    for (const v of f.values) {
      if (Number.isNaN(v)) continue
      present++
      expect(v).toBeGreaterThanOrEqual(0)
      max = Math.max(max, v)
    }
    expect(present).toBe(584269)
    expect(max).toBeGreaterThan(3)
    expect(max).toBeLessThan(25)
    // Land is masked and the Southern Ocean is rougher than the equatorial Pacific.
    const at = (lat: number, lon: number) => f.values[Math.round((f.lat1 - lat) / f.dj) * f.ni + Math.round(lon / f.di)]
    expect(at(40, 262)).toBeNaN() // Kansas
    const mean = (lat: number) => {
      let sum = 0
      let n = 0
      for (let x = 0; x < f.ni; x++) {
        const v = f.values[Math.round((f.lat1 - lat) / f.dj) * f.ni + x]
        if (Number.isNaN(v)) continue
        sum += v
        n++
      }
      return sum / n
    }
    expect(mean(-55)).toBeGreaterThan(mean(0) + 1)
    // The JPEG 2000 decode of ~600k points ran 7.7 s under coverage on the CI runner (5 s default).
  }, 30_000)

  it('still reads template 5.3 fields', async () => {
    const f = await decodeGribFieldAsync(fixture())
    expect([f.ni, f.nj]).toEqual([360, 181])
  })

  it('rejects a truncated wave message', async () => {
    await expect(decodeGribFieldAsync(decode(waveB64).subarray(0, 4000))).rejects.toBeInstanceOf(Grib2Error)
  })
})
