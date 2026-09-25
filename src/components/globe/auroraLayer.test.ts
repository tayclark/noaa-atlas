import { describe, expect, it } from 'vitest'
import { SwpcHttpError, SwpcParseError } from '../../data/swpcClient'
import { parseOvation } from '../../data/swpcSchema'
import { makeOvation } from '../../data/swpcFixtures'
import {
  auroraAt,
  auroraColor,
  auroraRaster,
  describeSwpcFetchOutcome,
  formatAuroraPopupHtml,
  formatUtcTime,
  MERCATOR_MAX_LAT,
  mercatorRowLatitude,
  type AuroraRaster,
} from './auroraLayer'

const ovation = parseOvation(
  makeOvation([
    [0, -90, 4],
    [0, 65, 0],
    [200, 65, 22],
    [359, 70, 1],
  ]),
)

/** The raster pixel's RGBA at a longitude and latitude, found by scanning for the nearest centre. */
function pixelAt(raster: AuroraRaster, [lng, lat]: [number, number]): number[] {
  const col = Math.floor(((lng + 180) / 360) * raster.width)
  let row = 0
  for (let r = 0; r < raster.height; r++) {
    if (Math.abs(mercatorRowLatitude(r, raster.height) - lat) < Math.abs(mercatorRowLatitude(row, raster.height) - lat)) row = r
  }
  const i = (row * raster.width + col) * 4
  return [...raster.data.slice(i, i + 4)]
}

/** A block of cells all at one value, in OVATION's 0..359 longitudes. */
function block(lons: number[], lats: number[], value: number): [number, number, number][] {
  return lons.flatMap((lon) => lats.map((lat): [number, number, number] => [lon, lat, value]))
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('auroraColor', () => {
  it('is transparent at zero and follows the green, yellow, red ramp', () => {
    expect(auroraColor(0)[3]).toBe(0)
    expect(auroraColor(50)).toEqual([241, 196, 15, 255])
    expect(auroraColor(80)).toEqual([231, 76, 60, 255])
    expect(auroraColor(100)).toEqual([231, 76, 60, 255])
  })

  it('interpolates between stops', () => {
    expect(auroraColor(35)).toEqual([144, 200, 64, 230])
  })
})

describe('mercatorRowLatitude', () => {
  it('runs from just under the Mercator limit at the top, through the equator, to the south', () => {
    expect(mercatorRowLatitude(0, 720)).toBeGreaterThan(84.9)
    expect(mercatorRowLatitude(0, 720)).toBeLessThan(MERCATOR_MAX_LAT)
    expect(mercatorRowLatitude(359, 720)).toBeCloseTo(-mercatorRowLatitude(360, 720))
    expect(mercatorRowLatitude(719, 720)).toBeCloseTo(-mercatorRowLatitude(0, 720))
  })
})

describe('auroraRaster', () => {
  it('counts the cells with any aurora', () => {
    expect(auroraRaster(ovation, 90).cells).toBe(3)
  })

  it('colours a pixel by the probability there, wrapping OVATION longitudes, and leaves the rest clear', () => {
    const raster = auroraRaster(parseOvation(makeOvation(block(range(195, 205), range(60, 70), 50))))
    expect(pixelAt(raster, [-160, 65])).toEqual(auroraColor(50))
    expect(pixelAt(raster, [20, 65])[3]).toBe(0)
    expect(pixelAt(raster, [-160, 0])[3]).toBe(0)
  })

  it('keeps high-latitude rows continuous, with no gaps between grid rows', () => {
    const raster = auroraRaster(parseOvation(makeOvation(block(range(195, 205), range(60, 75), 90))))
    for (let lat = 61; lat <= 74; lat += 0.25) expect(pixelAt(raster, [-160, lat])).toEqual(auroraColor(90))
  })

  it('blends across 0° longitude, where the OVATION grid wraps from 359 back to 0', () => {
    const raster = auroraRaster(parseOvation(makeOvation(block([358, 359, 0, 1], range(-2, 2), 50))))
    expect(pixelAt(raster, [-0.1, 0])).toEqual(auroraColor(50))
    expect(pixelAt(raster, [0.1, 0])).toEqual(auroraColor(50))
  })
})

describe('auroraAt', () => {
  it('reads the nearest grid cell, in either longitude convention', () => {
    expect(auroraAt(ovation, [-160.4, 64.6])).toBe(22)
    expect(auroraAt(ovation, [200, 65])).toBe(22)
    expect(auroraAt(ovation, [-0.6, 70.2])).toBe(1)
  })

  it('returns null for a zero or missing cell', () => {
    expect(auroraAt(ovation, [0, 65])).toBeNull()
    expect(auroraAt(ovation, [-97, 38])).toBeNull()
  })
})

describe('popup and messages', () => {
  it('formats a UTC clock time', () => {
    expect(formatUtcTime('2026-09-25T01:22:00Z')).toBe('01:22 UTC')
  })

  it('formats the aurora line for the click popup', () => {
    expect(formatAuroraPopupHtml(22, '2026-09-25T01:22:00Z')).toBe(
      '<strong>Aurora</strong>: 22% chance here <span style="opacity: 0.7">(forecast for 01:22 UTC)</span>',
    )
  })

  it('describes each kind of fetch failure', () => {
    expect(describeSwpcFetchOutcome(new SwpcHttpError(503))).toMatch(/unavailable \(503\)/)
    expect(describeSwpcFetchOutcome(new SwpcParseError('bad', null))).toMatch(/unexpected/)
    expect(describeSwpcFetchOutcome(new TypeError('Failed to fetch'))).toMatch(/Could not reach SWPC/)
  })
})
