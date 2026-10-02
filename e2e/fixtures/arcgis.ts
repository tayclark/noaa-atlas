// ArcGIS overlay mocks for e2e (#247). MapLibre requests the export images itself, so those get a
// route answering every tile with a 1x1 transparent PNG; the legend call is a separate route.

import type { Page } from '@playwright/test'
import { makeArcgisLegend, makeArcgisVectorLegend } from '../../src/data/arcgisFixtures'

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export const ARCGIS_RASTER_EXPORT = '**/raster/rest/services/obs/rfc_qpe/MapServer/export**'
export const ARCGIS_RASTER_LEGEND = '**/raster/rest/services/obs/rfc_qpe/MapServer/legend**'
export const ARCGIS_VECTOR_EXPORT = '**/vector/rest/services/outlooks/cpc_6_10_day_outlk/MapServer/export**'
export const ARCGIS_VECTOR_LEGEND = '**/vector/rest/services/outlooks/cpc_6_10_day_outlk/MapServer/legend**'

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

/** The same mocks for the NWS GIS portal's vector MapServer (the CPC 6-10 day outlook). */
export async function mockArcgisVector(page: Page, { legend = true } = {}) {
  const requests: string[] = []
  const headers = { 'access-control-allow-origin': '*' }
  await page.route(ARCGIS_VECTOR_EXPORT, (route) => {
    requests.push(route.request().url())
    return route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG, headers })
  })
  await page.route(ARCGIS_VECTOR_LEGEND, (route) =>
    legend ? route.fulfill({ json: makeArcgisVectorLegend(), headers }) : route.fulfill({ status: 503, headers }),
  )
  return requests
}
