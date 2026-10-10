// SPC Day 1 outlook mock for e2e: one polygon around the globe's initial centre (-98.5, 39.8), so
// the canvas centre lands inside it.

import type { Page } from '@playwright/test'
import { makeSpcFeature } from '../../src/data/spcFixtures'
import { corsJson } from './cors'

export const SPC_URL = /spc\.noaa\.gov\/products\/outlook\/day1otlk_cat/

export function spcOutlookFixture() {
  const feature = makeSpcFeature('SLGT', 'Slight Risk', '#F6F67B', '#DDAA00', [[-110, 30], [-110, 50], [-85, 50], [-85, 30], [-110, 30]])
  return { type: 'FeatureCollection', features: [{ ...feature, properties: { ...feature.properties, FORECASTER: 'Test Forecaster' } }] }
}

export async function mockSpcOutlook(page: Page, body: unknown = spcOutlookFixture()) {
  await page.route(SPC_URL, (route) =>
    route.fulfill(corsJson(body, { contentType: 'application/geo+json' })),
  )
}
