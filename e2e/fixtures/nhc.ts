// NHC storm track mock for e2e (#334): the summary MapServer's three layer queries, answered from the
// trimmed real Isaias and Rachel data the unit tests use.

import type { Page } from '@playwright/test'
import type { NhcStormData } from '../../src/data/nhcClient'
import { makeNhcStormData } from '../../src/data/nhcFixtures'

export const NHC_URL = /NHC_tropical_weather_summary\/MapServer\/\d+\/query/

const LAYER_PARTS: Readonly<Record<string, keyof NhcStormData>> = { '10': 'past', '5': 'forecast', '7': 'cones' }

export async function mockNhcStorms(page: Page, data: NhcStormData = makeNhcStormData()) {
  await page.route(NHC_URL, (route) => {
    const layer = /MapServer\/(\d+)\/query/.exec(route.request().url())?.[1] ?? ''
    const part = LAYER_PARTS[layer]
    if (!part) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({
      contentType: 'application/geo+json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(data[part]),
    })
  })
}
