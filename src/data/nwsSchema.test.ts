import { describe, expect, it } from 'vitest'
import {
  makeAlertCollection,
  makeAlertFeature,
  makeForecastPeriod,
  makeGridpointForecast,
  makePoint,
  makeStation,
  makeStationCollection,
} from './nwsFixtures'
import { parseAlertCollection, parseGridpointForecast, parsePoint, parseStationCollection } from './nwsSchema'

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
