// SPC Day 1 outlook mock for e2e: one polygon around the globe's initial centre (-98.5, 39.8), so
// the canvas centre lands inside it.

import type { Page } from '@playwright/test'

export const SPC_URL = /spc\.noaa\.gov\/products\/outlook\/day1otlk_cat/

export function spcOutlookFixture() {
  const ring = [[-110, 30], [-110, 50], [-85, 50], [-85, 30], [-110, 30]]
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: [[ring]] },
        properties: {
          LABEL: 'SLGT',
          LABEL2: 'Slight Risk',
          fill: '#F6F67B',
          stroke: '#DDAA00',
          VALID_ISO: '2026-10-01T13:00:00+00:00',
          EXPIRE_ISO: '2026-10-02T12:00:00+00:00',
          FORECASTER: 'Test Forecaster',
        },
      },
    ],
  }
}

export async function mockSpcOutlook(page: Page, body: unknown = spcOutlookFixture()) {
  await page.route(SPC_URL, (route) =>
    route.fulfill({ contentType: 'application/geo+json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }),
  )
}
