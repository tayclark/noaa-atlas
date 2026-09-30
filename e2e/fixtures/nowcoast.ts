// nowCOAST radar mocks for e2e (#56). MapLibre requests the WMS tiles itself, so the mock is a
// route on the tile URL that answers every tile with a 1x1 transparent PNG.

import type { Page } from '@playwright/test'

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export const RADAR_TILES = '**/geoserver/weather_radar/wms**'

/** Serves transparent tiles and returns the list that the page requested, for asserting on. */
export async function mockRadar(page: Page) {
  const requests: string[] = []
  await page.route(RADAR_TILES, (route) => {
    requests.push(route.request().url())
    return route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG, headers: { 'access-control-allow-origin': '*' } })
  })
  return requests
}
