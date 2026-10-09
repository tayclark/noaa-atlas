// NHC storm track mock for e2e (#334): the summary MapServer's three layer queries, answered from the
// trimmed real Isaias and Rachel data the unit tests use. Also the GOES imagery under the tracks (#338):
// transparent tiles, and a frame list that covers the hours before Isaias's 15:00 UTC advisory.

import type { Page } from '@playwright/test'
import type { NhcStormData } from '../../src/data/nhcClient'
import { makeNhcStormData } from '../../src/data/nhcFixtures'
import { TRANSPARENT_PNG } from './nowcoast'

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

export const GOES_TILES = '**/geoserver/satellite/wms**'

export const GOES_FRAMES = ['2026-10-09T13:00:00.000Z', '2026-10-09T14:00:00.000Z', '2026-10-09T14:30:00.000Z']

const GOES_CAPABILITIES = `<WMS_Capabilities><Capability><Layer><Layer><Name>goes_longwave_imagery</Name>
<Dimension name="time" default="current" units="ISO8601">${GOES_FRAMES.join(',')}</Dimension>
</Layer></Layer></Capability></WMS_Capabilities>`

/** Serves the GOES frame list and transparent tiles. Returns the GetMap URLs requested. */
export async function mockGoesSatellite(page: Page) {
  const requests: string[] = []
  await page.route(GOES_TILES, (route) => {
    const url = route.request().url()
    const headers = { 'access-control-allow-origin': '*' }
    if (url.includes('request=GetCapabilities')) return route.fulfill({ contentType: 'text/xml', body: GOES_CAPABILITIES, headers })
    requests.push(url)
    return route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG, headers })
  })
  return requests
}
