import { describe, expect, it } from 'vitest'
import { parseAlertCollection } from '../../data/nwsSchema'
import { makeAlertCollection, makeAlertFeature } from '../../data/nwsFixtures'
import {
  ALERT_SEVERITY_COLORS,
  alertSeverityColorExpression,
  describeAlertForPopup,
  splitAlertsByGeometry,
} from './nwsAlertsLayer'

describe('alertSeverityColorExpression', () => {
  it('maps every known severity to a color, with an Unknown-colored fallback', () => {
    const [op, get, ...rest] = alertSeverityColorExpression() as unknown as unknown[]
    expect(op).toBe('match')
    expect(get).toEqual(['get', 'severity'])
    // rest is [severity, color, severity, color, ..., fallbackColor]
    const fallback = rest[rest.length - 1]
    expect(fallback).toBe(ALERT_SEVERITY_COLORS.Unknown)
    for (const [severity, color] of Object.entries(ALERT_SEVERITY_COLORS)) {
      const idx = rest.indexOf(severity)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(rest[idx + 1]).toBe(color)
    }
  })
})

describe('splitAlertsByGeometry', () => {
  it('keeps polygon alerts in mappable and moves null-geometry alerts to zoneOnly', () => {
    const baseProperties = makeAlertFeature().properties as Record<string, unknown>
    const withGeometry = makeAlertFeature({ properties: { ...baseProperties, id: 'with-geo' } })
    const zoneOnly = makeAlertFeature({
      properties: { ...baseProperties, id: 'zone-only' },
      geometry: null,
    })
    const collection = parseAlertCollection(makeAlertCollection([withGeometry, zoneOnly]))

    const result = splitAlertsByGeometry(collection)

    expect(result.mappable.features).toHaveLength(1)
    expect(result.mappable.features[0]?.properties.id).toBe('with-geo')
    expect(result.zoneOnly).toHaveLength(1)
    expect(result.zoneOnly[0]?.properties.id).toBe('zone-only')
  })

  it('handles an all-mappable collection with an empty zoneOnly list', () => {
    const collection = parseAlertCollection(makeAlertCollection())
    const result = splitAlertsByGeometry(collection)
    expect(result.mappable.features).toHaveLength(1)
    expect(result.zoneOnly).toHaveLength(0)
  })
})

describe('describeAlertForPopup', () => {
  it('formats event, area and times from alert properties', () => {
    const collection = parseAlertCollection(makeAlertCollection())
    const feature = collection.features[0]
    if (!feature) throw new Error('expected a fixture feature')

    const popup = describeAlertForPopup(feature.properties)

    expect(popup.event).toBe('Winter Storm Warning')
    expect(popup.areaDesc).toBe('King County, WA')
    expect(popup.effective).toBe(new Date(feature.properties.effective).toLocaleString())
    expect(popup.expires).toBe(new Date(feature.properties.expires).toLocaleString())
  })
})
