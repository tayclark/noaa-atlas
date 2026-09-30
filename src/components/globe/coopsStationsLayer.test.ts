import { describe, expect, it } from 'vitest'
import { CoopsHttpError, CoopsParseError } from '../../data/coopsClient'
import type { CoopsReading, CoopsResult, CoopsTide } from '../../data/coopsSchema'
import {
  describeCoopsFetchOutcome,
  formatStationLoadingHtml,
  formatStationPopupHtml,
  stationsToGeoJSON,
  type Fetched,
} from './coopsStationsLayer'

const station = { name: 'Panama City', state: 'FL' }
const ok = <T>(value: T): Fetched<T> => ({ status: 'fulfilled', value: { ok: true, value } as CoopsResult<T> })
const failed = <T>(message: string): Fetched<T> => ({ status: 'fulfilled', value: { ok: false, message } })
const rejected = <T>(reason: unknown): Fetched<T> => ({ status: 'rejected', reason })

const reading: CoopsReading = { time: '2026-09-30 13:48', metres: 0.403 }
const tides: CoopsTide[] = [
  { time: '2026-09-30 04:34', metres: 0.598, kind: 'high' },
  { time: '2026-09-30 15:46', metres: 0.073, kind: 'low' },
]

describe('stationsToGeoJSON', () => {
  it('makes a Point per station in [lng, lat] order', () => {
    const fc = stationsToGeoJSON([{ id: '8729108', name: 'Panama City', lat: 30.1497, lng: -85.6644, state: 'FL' }])
    expect(fc.features).toEqual([
      {
        type: 'Feature',
        properties: { id: '8729108', name: 'Panama City', state: 'FL' },
        geometry: { type: 'Point', coordinates: [-85.6644, 30.1497] },
      },
    ])
  })
})

describe('formatStationPopupHtml', () => {
  it('shows the latest level and the predicted tides in UTC', () => {
    const html = formatStationPopupHtml(station, ok<CoopsReading | null>(reading), ok(tides))
    expect(html).toContain('Panama City, FL')
    expect(html).toContain('0.40 m')
    expect(html).toContain('13:48 UTC')
    expect(html).toContain('High 0.60 m at 04:34 UTC')
    expect(html).toContain('Low 0.07 m at 15:46 UTC')
    expect(html).toContain('Preliminary data')
  })

  it('omits the comma when a station has no state', () => {
    expect(formatStationLoadingHtml({ name: 'Somewhere', state: '' })).toContain('<strong>Somewhere</strong>')
  })

  it('says so when a station has no recent reading or no tides today', () => {
    const html = formatStationPopupHtml(station, ok<CoopsReading | null>(null), ok<CoopsTide[]>([]))
    expect(html).toContain('no recent reading')
    expect(html).toContain('none for today')
  })

  it('shows a missing value as text rather than NaN', () => {
    const html = formatStationPopupHtml(station, ok<CoopsReading | null>({ time: reading.time, metres: null }), ok(tides))
    expect(html).toContain('no value')
    expect(html).not.toContain('NaN')
  })

  it("keeps one half when the other fails, using CO-OPS's own message or a fetch message", () => {
    const html = formatStationPopupHtml(
      station,
      failed<CoopsReading | null>('There is no MLLW for the station: 1'),
      rejected<CoopsTide[]>(new CoopsHttpError(503)),
    )
    expect(html).toContain('Water level: There is no MLLW for the station: 1')
    expect(html).toContain('Predicted tides: CO-OPS is unavailable (503).')
  })

  it('escapes HTML in a station name', () => {
    const html = formatStationPopupHtml({ name: '<img src=x>', state: '' }, ok<CoopsReading | null>(reading), ok(tides))
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x&gt;')
  })
})

describe('describeCoopsFetchOutcome', () => {
  it('distinguishes http, parse and network failures', () => {
    expect(describeCoopsFetchOutcome(new CoopsHttpError(500))).toBe('CO-OPS is unavailable (500).')
    expect(describeCoopsFetchOutcome(new CoopsParseError('x', null))).toBe('CO-OPS returned an unexpected response.')
    expect(describeCoopsFetchOutcome(new TypeError('Failed to fetch'))).toBe('Could not reach CO-OPS.')
  })
})
