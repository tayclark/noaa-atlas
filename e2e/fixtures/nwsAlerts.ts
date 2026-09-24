// Minimal valid api.weather.gov /alerts/active responses for e2e mocking (page.route), matching
// the shape src/data/nwsSchema.ts's alertCollectionSchema requires.

import type { Page } from '@playwright/test'
import { US_CENTER } from '../../src/components/globe/globeConfig'

/** A box straddling US_CENTER, large enough that clicking the globe canvas's on-screen center lands inside it. */
const [centerLng, centerLat] = US_CENTER
const ALERT_BOX = [
  [
    [centerLng - 10, centerLat - 10],
    [centerLng + 10, centerLat - 10],
    [centerLng + 10, centerLat + 10],
    [centerLng - 10, centerLat + 10],
    [centerLng - 10, centerLat - 10],
  ],
] as const

export function mappableAlertsFixture() {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {
          id: 'e2e-test-alert-1',
          event: 'Flood Warning',
          headline: 'Flood Warning issued for the test area',
          severity: 'Severe' as const,
          areaDesc: 'Test County',
          effective: '2026-09-23T00:00:00-05:00',
          expires: '2026-09-24T00:00:00-05:00',
        },
        geometry: { type: 'Polygon' as const, coordinates: ALERT_BOX },
      },
    ],
  }
}

/** `count` zone-only alerts (null geometry), which the globe lists in an overlay instead of drawing. */
export function zoneOnlyAlertsFixture(count: number) {
  const base = mappableAlertsFixture().features[0]!
  return {
    type: 'FeatureCollection' as const,
    features: Array.from({ length: count }, (_, i) => ({
      ...base,
      properties: { ...base.properties, id: `e2e-zone-alert-${i}`, event: 'Winter Storm Watch', areaDesc: `Zone ${i}` },
      geometry: null,
    })),
  }
}

export function emptyAlertsFixture() {
  return { type: 'FeatureCollection' as const, features: [] }
}

export async function mockAlerts(
  page: Page,
  fixture: ReturnType<typeof mappableAlertsFixture> | ReturnType<typeof zoneOnlyAlertsFixture> | ReturnType<typeof emptyAlertsFixture>,
) {
  await page.route('**/alerts/active', (route) => route.fulfill({ json: fixture }))
}
