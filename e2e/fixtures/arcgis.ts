// ArcGIS overlay mocks for e2e (#247). MapLibre requests the export images itself, so those get a
// route answering every tile with a 1x1 transparent PNG; the legend call is a separate route.

import type { Page } from '@playwright/test'
import { makeArcgisLegend } from '../../src/data/arcgisFixtures'

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export const ARCGIS_RASTER_EXPORT = '**/raster/rest/services/obs/rfc_qpe/MapServer/export**'
export const ARCGIS_RASTER_LEGEND = '**/raster/rest/services/obs/rfc_qpe/MapServer/legend**'

/**
 * Serves transparent export tiles and the legend. Returns the export URLs the page requested;
 * pass `{ legend: false }` to make the legend call fail.
 */
export async function mockArcgisRaster(page: Page, { legend = true } = {}) {
  const requests: string[] = []
  const headers = { 'access-control-allow-origin': '*' }
  await page.route(ARCGIS_RASTER_EXPORT, (route) => {
    requests.push(route.request().url())
    return route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG, headers })
  })
  await page.route(ARCGIS_RASTER_LEGEND, (route) =>
    legend ? route.fulfill({ json: makeArcgisLegend(), headers }) : route.fulfill({ status: 503, headers }),
  )
  return requests
}
