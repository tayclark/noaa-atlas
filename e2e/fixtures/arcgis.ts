// ArcGIS overlay mocks for e2e (#247). MapLibre requests the export images itself, so those get a
// route answering every tile with a 1x1 transparent PNG; the legend call is a separate route.

import type { Page } from '@playwright/test'
import { makeArcgisChartsLegend, makeArcgisHabitatLegend, makeArcgisLegend, makeArcgisVectorLegend } from '../../src/data/arcgisFixtures'

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

export const ARCGIS_CHARTS_EXPORT = '**/MarineChart_Services/NOAACharts/MapServer/export**'
export const ARCGIS_CHARTS_LEGEND = '**/MarineChart_Services/NOAACharts/MapServer/legend**'

/** The same mocks for the NOAA chart MapServer, whose real legend has no entries. */
export async function mockArcgisCharts(page: Page) {
  const requests: string[] = []
  const headers = { 'access-control-allow-origin': '*' }
  await page.route(ARCGIS_CHARTS_EXPORT, (route) => {
    requests.push(route.request().url())
    return route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG, headers })
  })
  await page.route(ARCGIS_CHARTS_LEGEND, (route) => route.fulfill({ json: makeArcgisChartsLegend(), headers }))
  return requests
}

export const ARCGIS_HABITAT_EXPORT = '**/All_NMFS_Critical_Habitat/MapServer/export**'
export const ARCGIS_HABITAT_LEGEND = '**/All_NMFS_Critical_Habitat/MapServer/legend**'

/** The same mocks for the NMFS critical habitat MapServer, whose real legend swatches have no labels. */
export async function mockArcgisHabitat(page: Page) {
  const requests: string[] = []
  const headers = { 'access-control-allow-origin': '*' }
  await page.route(ARCGIS_HABITAT_EXPORT, (route) => {
    requests.push(route.request().url())
    return route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG, headers })
  })
  await page.route(ARCGIS_HABITAT_LEGEND, (route) => route.fulfill({ json: makeArcgisHabitatLegend(), headers }))
  return requests
}

/**
 * A blank 256x256 export tile is about 885 bytes; every tile with something drawn on it that we
 * measured was 4 kB or more. A live overlay whose largest tile stays under this draws nothing (#287).
 */
export const BLANK_TILE_MAX_BYTES = 1500

export interface LiveTile {
  status: number
  contentType: string
  bytes: number
}

/**
 * Records the real export tiles MapLibre fetches for one MapServer (`servicePath` is part of its URL,
 * e.g. `All_NMFS_Critical_Habitat`). The tiles bypass the Inspector, so this listens on the page.
 */
export function collectArcgisTiles(page: Page, servicePath: string) {
  const tiles: LiveTile[] = []
  page.on('response', async (res) => {
    if (!res.url().includes(`${servicePath}/MapServer/export`)) return
    const bytes = await res.body().then((body) => body.length, () => 0)
    tiles.push({ status: res.status(), contentType: res.headers()['content-type'] ?? '', bytes })
  })
  return tiles
}

/** The size of the largest image tile, or 0 before any has arrived. */
export function largestTileBytes(tiles: readonly LiveTile[]) {
  return Math.max(0, ...tiles.filter((t) => t.status === 200 && t.contentType.includes('image/png')).map((t) => t.bytes))
}
