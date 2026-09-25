import { describe, expect, it } from 'vitest'
import { SwpcHttpError, SwpcParseError } from '../../data/swpcClient'
import { parseOvation } from '../../data/swpcSchema'
import { makeOvation } from '../../data/swpcFixtures'
import {
  auroraAt,
  auroraHeatmapPaint,
  auroraToGeoJson,
  describeSwpcFetchOutcome,
  formatAuroraPopupHtml,
  formatUtcTime,
  wrapLongitude,
} from './auroraLayer'

const ovation = parseOvation(
  makeOvation([
    [0, -90, 4],
    [0, 65, 0],
    [200, 65, 22],
    [359, 70, 1],
  ]),
)

describe('wrapLongitude', () => {
  it('keeps the eastern hemisphere and wraps 181..359 to the western', () => {
    expect(wrapLongitude(0)).toBe(0)
    expect(wrapLongitude(180)).toBe(180)
    expect(wrapLongitude(200)).toBe(-160)
    expect(wrapLongitude(359)).toBe(-1)
  })
})

describe('auroraToGeoJson', () => {
  it('drops zero cells and wraps longitudes', () => {
    const points = auroraToGeoJson(ovation)
    expect(points.features.map((f) => [...f.geometry.coordinates, f.properties.aurora])).toEqual([
      [0, -90, 4],
      [-160, 65, 22],
      [-1, 70, 1],
    ])
  })

  it('honours a higher threshold', () => {
    expect(auroraToGeoJson(ovation, 5).features).toHaveLength(1)
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

describe('auroraHeatmapPaint', () => {
  it('weights by probability, is transparent at zero density and takes the given opacity', () => {
    const paint = auroraHeatmapPaint(0.8)
    expect(paint['heatmap-weight']).toEqual(['interpolate', ['linear'], ['get', 'aurora'], 0, 0, 100, 1])
    expect(paint['heatmap-color'][4]).toBe('rgba(46, 204, 113, 0)')
    expect(paint['heatmap-opacity']).toBe(0.8)
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
