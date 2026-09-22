import { describe, expect, it } from 'vitest'
import { NwsHttpError, NwsParseError } from '../../data/nwsClient'
import { makeGridpointForecast, makeObservation, makeStation, makeStationCollection } from '../../data/nwsFixtures'
import { parseObservation, parseGridpointForecast, parseStationCollection } from '../../data/nwsSchema'
import {
  describePointError,
  describePointForPopup,
  formatPointErrorHtml,
  formatPointLoadingHtml,
  formatPointPopupHtml,
  pickNearestStation,
} from './nwsPointLookup'

describe('pickNearestStation', () => {
  it('picks the closest station to the click point', () => {
    const near = makeStation({
      properties: { stationIdentifier: 'NEAR', name: 'Near station' },
      geometry: { type: 'Point', coordinates: [-122.31, 47.44] },
    })
    const far = makeStation({
      properties: { stationIdentifier: 'FAR', name: 'Far station' },
      geometry: { type: 'Point', coordinates: [-100.0, 40.0] },
    })
    const stations = parseStationCollection(makeStationCollection([far, near]))

    const nearest = pickNearestStation(stations, 47.45, -122.3)

    expect(nearest?.properties.stationIdentifier).toBe('NEAR')
  })

  it('returns the only station when there is one', () => {
    const stations = parseStationCollection(makeStationCollection())
    const nearest = pickNearestStation(stations, 47.6, -122.3)
    expect(nearest?.properties.stationIdentifier).toBe('KSEA')
  })

  it('returns undefined for an empty station list', () => {
    const stations = parseStationCollection(makeStationCollection([]))
    expect(pickNearestStation(stations, 47.6, -122.3)).toBeUndefined()
  })
})

describe('describePointForPopup', () => {
  it('formats forecast period name, text description, temperature and wind', () => {
    const period = parseGridpointForecast(makeGridpointForecast()).properties.periods[0]
    if (!period) throw new Error('expected a fixture period')
    const observation = parseObservation(makeObservation())

    const content = describePointForPopup(period, observation)

    expect(content.location).toBe('Tonight')
    expect(content.shortForecast).toBe('Mostly Cloudy')
    expect(content.temperatureF).toBe(60) // 15.6C -> 60F
    expect(content.windSummary).toBe('8 km_h-1 at 220°')
  })

  it('passes through a non-Celsius temperature unchanged', () => {
    const period = parseGridpointForecast(makeGridpointForecast()).properties.periods[0]
    if (!period) throw new Error('expected a fixture period')
    const observation = parseObservation(
      makeObservation({ temperature: { value: 60.4, unitCode: 'wmoUnit:degF' } }),
    )

    const content = describePointForPopup(period, observation)

    expect(content.temperatureF).toBe(60)
  })

  it('renders a null temperature/wind as unavailable rather than throwing', () => {
    const period = parseGridpointForecast(makeGridpointForecast()).properties.periods[0]
    if (!period) throw new Error('expected a fixture period')
    const observation = parseObservation(
      makeObservation({
        temperature: { value: null, unitCode: 'wmoUnit:degC' },
        windSpeed: { value: null, unitCode: 'wmoUnit:km_h-1' },
        windDirection: { value: null, unitCode: 'wmoUnit:degree_(angle)' },
      }),
    )

    const content = describePointForPopup(period, observation)

    expect(content.temperatureF).toBeNull()
    expect(content.windSummary).toBe('Calm')
    expect(formatPointPopupHtml(content)).toContain('—')
  })
})

describe('describePointError', () => {
  it('describes a rate-limited error', () => {
    const err = new NwsHttpError(429, 'rate-limited', 'rate limited')
    expect(describePointError(err)).toMatch(/rate limit/i)
  })

  it('describes a server error', () => {
    const err = new NwsHttpError(500, 'server-error', 'server error')
    expect(describePointError(err)).toMatch(/service error/i)
  })

  it('describes a forbidden/unknown error as no coverage', () => {
    expect(describePointError(new NwsHttpError(403, 'forbidden', 'forbidden'))).toMatch(/no nws coverage/i)
    expect(describePointError(new NwsHttpError(404, 'unknown', 'not found'))).toMatch(/no nws coverage/i)
  })

  it('describes a parse error', () => {
    const err = new NwsParseError('bad shape', new Error('cause'))
    expect(describePointError(err)).toMatch(/unexpected response/i)
  })

  it('describes an unrecognized error with a generic fallback', () => {
    expect(describePointError(new Error('boom'))).toMatch(/something went wrong/i)
  })
})

describe('formatPointLoadingHtml / formatPointErrorHtml', () => {
  it('renders non-empty HTML strings', () => {
    expect(formatPointLoadingHtml()).toContain('Loading')
    expect(formatPointErrorHtml('No NWS coverage at this location.')).toContain('No NWS coverage')
  })
})
