import { describe, expect, it } from 'vitest'
import { NwsHttpError, NwsParseError } from '../../data/nwsClient'
import { parseAlertCollection } from '../../data/nwsSchema'
import { makeAlertCollection, makeAlertFeature } from '../../data/nwsFixtures'
import {
  ALERT_SEVERITY_COLORS,
  alertSeverityColorExpression,
  describeAlertForPopup,
  describeAlertsFetchOutcome,
  splitAlertsByGeometry,
  visibleZoneOnlyAlerts,
  zoneOnlyAlertsTitle,
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

describe('visibleZoneOnlyAlerts', () => {
  const baseProperties = makeAlertFeature().properties as Record<string, unknown>
  const makeFeatures = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      parseAlertCollection(
        makeAlertCollection([makeAlertFeature({ properties: { ...baseProperties, id: `zone-${i}` } })]),
      ).features[0]!,
    )

  it('returns the full list unchanged when under the cap', () => {
    const features = makeFeatures(3)
    const result = visibleZoneOnlyAlerts(features, 5, false)
    expect(result.visible).toEqual(features)
    expect(result.hiddenCount).toBe(0)
  })

  it('caps the list and reports the hidden count when collapsed and over the cap', () => {
    const features = makeFeatures(8)
    const result = visibleZoneOnlyAlerts(features, 5, false)
    expect(result.visible).toHaveLength(5)
    expect(result.visible).toEqual(features.slice(0, 5))
    expect(result.hiddenCount).toBe(3)
  })

  it('returns the full list with no hidden count when expanded', () => {
    const features = makeFeatures(8)
    const result = visibleZoneOnlyAlerts(features, 5, true)
    expect(result.visible).toEqual(features)
    expect(result.hiddenCount).toBe(0)
  })
})

describe('describeAlertsFetchOutcome', () => {
  it('describes a rate-limited error', () => {
    const err = new NwsHttpError(429, 'rate-limited', 'rate limited')
    expect(describeAlertsFetchOutcome(err)).toMatch(/rate limit/i)
  })

  it('describes a server error', () => {
    const err = new NwsHttpError(500, 'server-error', 'server error')
    expect(describeAlertsFetchOutcome(err)).toMatch(/service is unavailable/i)
  })

  it('describes a forbidden/unknown error as a generic load failure', () => {
    expect(describeAlertsFetchOutcome(new NwsHttpError(403, 'forbidden', 'forbidden'))).toMatch(/could not load/i)
    expect(describeAlertsFetchOutcome(new NwsHttpError(404, 'unknown', 'not found'))).toMatch(/could not load/i)
  })

  it('describes a parse error', () => {
    const err = new NwsParseError('bad shape', new Error('cause'))
    expect(describeAlertsFetchOutcome(err)).toMatch(/unexpected/i)
  })

  it('describes an unknown error generically', () => {
    expect(describeAlertsFetchOutcome(new Error('boom'))).toMatch(/something went wrong/i)
  })
})

describe('zoneOnlyAlertsTitle', () => {
  it('counts the alerts, singular and plural', () => {
    expect(zoneOnlyAlertsTitle(1)).toBe('1 alert without a map area')
    expect(zoneOnlyAlertsTitle(468)).toBe('468 alerts without a map area')
  })
})
