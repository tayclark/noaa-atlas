import { describe, expect, it } from 'vitest'
import {
  makeAlertCollection,
  makeAlertFeature,
  makeForecastPeriod,
  makeGridpointForecast,
  makeObservation,
  makePoint,
  makeStation,
  makeStationCollection,
} from './nwsFixtures'
import {
  parseAlertCollection,
  parseGridpointForecast,
  parseObservation,
  parsePoint,
  parseStationCollection,
} from './nwsSchema'

describe('parseAlertCollection', () => {
  it('accepts a valid alert collection', () => {
    expect(() => parseAlertCollection(makeAlertCollection())).not.toThrow()
  })

  it('accepts a MultiPolygon geometry', () => {
    const geometry = { type: 'MultiPolygon', coordinates: [[[[-122.5, 47.5], [-122.3, 47.5], [-122.3, 47.7], [-122.5, 47.5]]]] }
    expect(() => parseAlertCollection(makeAlertCollection([makeAlertFeature({ geometry })]))).not.toThrow()
  })

  it('accepts a null geometry for a zone-only alert', () => {
    const parsed = parseAlertCollection(makeAlertCollection([makeAlertFeature({ geometry: null })]))
    expect(parsed.features[0].geometry).toBeNull()
  })

  it('rejects an unknown severity', () => {
    const feature = makeAlertFeature({ properties: { ...makeAlertFeature().properties as object, severity: 'Catastrophic' } })
    expect(() => parseAlertCollection(makeAlertCollection([feature]))).toThrow(/Invalid NWS response/)
  })

  it('rejects a missing event', () => {
    const properties = { ...(makeAlertFeature().properties as object) } as Record<string, unknown>
    delete properties.event
    expect(() => parseAlertCollection(makeAlertCollection([makeAlertFeature({ properties })]))).toThrow()
  })
})

describe('parsePoint', () => {
  it('accepts a valid point', () => {
    expect(() => parsePoint(makePoint())).not.toThrow()
  })

  it('round-trips gridId/gridX/gridY', () => {
    const point = parsePoint(makePoint())
    expect(point.properties.gridId).toBe('SEW')
    expect(point.properties.gridX).toBe(125)
    expect(point.properties.gridY).toBe(68)
  })

  it('rejects a missing forecast url', () => {
    expect(() => parsePoint(makePoint({ forecast: undefined }))).toThrow()
  })
})

describe('parseGridpointForecast', () => {
  it('accepts a valid forecast', () => {
    expect(() => parseGridpointForecast(makeGridpointForecast())).not.toThrow()
  })

  it('rejects a period missing detailedForecast', () => {
    const periods = [makeForecastPeriod({ detailedForecast: undefined })]
    expect(() => parseGridpointForecast(makeGridpointForecast({ periods }))).toThrow()
  })

  it('accepts a null updated timestamp (seen in practice from the live API)', () => {
    const forecast = parseGridpointForecast(makeGridpointForecast({ updated: null }))
    expect(forecast.properties.updated).toBeNull()
  })

  it('accepts a missing updated field (also seen in practice from the live API)', () => {
    const { updated: _updated, ...rest } = makeGridpointForecast().properties as Record<string, unknown>
    expect(() => parseGridpointForecast({ properties: rest })).not.toThrow()
  })
})

describe('parseStationCollection', () => {
  it('accepts a valid station collection', () => {
    expect(() => parseStationCollection(makeStationCollection())).not.toThrow()
  })

  it('rejects an unsupported geometry type', () => {
    const geometry = { type: 'Polygon', coordinates: [] }
    expect(() => parseStationCollection(makeStationCollection([makeStation({ geometry })]))).toThrow()
  })
})

describe('parseObservation', () => {
  it('accepts a valid observation', () => {
    expect(() => parseObservation(makeObservation())).not.toThrow()
  })

  it('accepts null measurement values (sensor down / calm wind)', () => {
    const observation = parseObservation(
      makeObservation({
        temperature: { value: null, unitCode: 'wmoUnit:degC' },
        windSpeed: { value: null, unitCode: 'wmoUnit:km_h-1' },
        windDirection: { value: null, unitCode: 'wmoUnit:degree_(angle)' },
      }),
    )
    expect(observation.properties.temperature.value).toBeNull()
  })

  it('rejects a missing textDescription', () => {
    expect(() => parseObservation(makeObservation({ textDescription: undefined }))).toThrow()
  })
})
