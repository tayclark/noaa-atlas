// ArcGIS MapServer overlays (#247): drawn only while their node is selected, against mocked export
// tiles and legend, plus `@live` checks that the real services draw (#287).

import { expect, test, type Page } from '@playwright/test'
import {
  BLANK_TILE_MAX_BYTES,
  collectArcgisTiles,
  largestTileBytes,
  mockArcgisCharts,
  mockArcgisHabitat,
  mockArcgisRaster,
  mockArcgisVector,
  type LiveTile,
} from './fixtures/arcgis'
import { GLOBE, waitForGlobe } from './fixtures/globe'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const NODE = 'nws-raster-map-services'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

test('requests no overlay tiles or legend until the node is selected', async ({ page }) => {
  const tiles = await mockArcgisRaster(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'hidden')
  // Give a stray request time to show up before asserting that none did.
  await page.waitForTimeout(1000)
  expect(tiles).toHaveLength(0)
})

test('selecting the node draws the overlay with its legend, and selecting something else hides it', async ({ page }) => {
  const tiles = await mockArcgisRaster(page)
  await page.goto('/')
  await waitForGlobe(page)

  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'arcgis-raster')
  await expect(page.getByLabel('Selection status')).toContainText('observed precipitation')
  await expect.poll(() => tiles.length).toBeGreaterThan(0)
  expect(tiles[0]).toContain('layers=show:28')
  const legend = page.getByRole('status', { name: 'Map overlay legend' })
  await expect(legend).toContainText('Greater than or equal to 10')
  await expect(legend).toContainText('0.1 to 0.25')
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('River Forecast Centers')

  await selectByKeyboard(page, 'nws-api')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'hidden')
  await expect(legend).toHaveCount(0)
})

test('the legend call lands in the Inspector', async ({ page }) => {
  await mockArcgisRaster(page)
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, NODE)
  await expect(page.getByRole('status', { name: 'Map overlay legend' })).toBeVisible()
  await page.getByRole('tab', { name: /Inspector/ }).click()
  await expect(page.getByRole('button', { name: /raster\/rest\/services\/obs\/rfc_qpe/ })).toBeVisible()
})

test('the overlay still draws, with a message, when the legend fails', async ({ page }) => {
  const tiles = await mockArcgisRaster(page, { legend: false })
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, NODE)
  await expect(page.getByRole('status', { name: 'Map overlay legend' })).toContainText('legend could not be loaded')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'arcgis-raster')
  await expect.poll(() => tiles.length).toBeGreaterThan(0)
})

test('the NWS GIS portal node draws the CPC outlook with its legend and logs the legend call', async ({ page }) => {
  const tiles = await mockArcgisVector(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'hidden')

  await selectByKeyboard(page, 'nws-gis-portal')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'arcgis-vector')
  await expect(page.getByLabel('Selection status')).toContainText('temperature outlook')
  await expect.poll(() => tiles.length).toBeGreaterThan(0)
  expect(tiles[0]).toContain('layers=show:0')
  const legend = page.getByRole('status', { name: 'Map overlay legend' })
  await expect(legend).toContainText('Above, 90%')
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Climate Prediction Center')

  await page.getByRole('tab', { name: /Inspector/ }).click()
  await expect(page.getByRole('button', { name: /vector\/rest\/services\/outlooks/ })).toBeVisible()
})

test('the NOAA chart services node draws the ENC charts, says they are not for navigation, and asks for no legend', async ({ page }) => {
  const tiles = await mockArcgisCharts(page)
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, 'noaa-chart-services')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'arcgis-charts')
  await expect(page.getByLabel('Selection status')).toContainText('not for navigation')
  await expect.poll(() => tiles.length).toBeGreaterThan(0)
  expect(tiles[0]).toContain('layers=show:0,1,2,3,4,5,6,7')
  await expect(page.getByRole('status', { name: 'Map overlay legend' })).toHaveCount(0)
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Office of Coast Survey')
  expect(tiles.legendRequests).toHaveLength(0)
})

test('the NMFS node draws critical habitat, both areas and lines, with no legend box', async ({ page }) => {
  const tiles = await mockArcgisHabitat(page)
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, 'nmfs-arcgis-services')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'arcgis-habitat')
  await expect(page.getByLabel('Selection status')).toContainText('50 CFR 226')
  await expect.poll(() => tiles.length).toBeGreaterThan(0)
  expect(tiles[0]).toContain('layers=show:226,2')
  await expect(page.getByRole('status', { name: 'Map overlay legend' })).toHaveCount(0)
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('NOAA Fisheries')

  await page.getByRole('tab', { name: /Inspector/ }).click()
  await expect(page.getByRole('button', { name: /server\/rest\/services\/All_NMFS/ })).toBeVisible()
})

test('a theme hub that lights two overlays draws both, charts underneath, with the legend that has entries (#288)', async ({ page }) => {
  const rasterTiles = await mockArcgisRaster(page)
  const chartTiles = await mockArcgisCharts(page)
  await page.goto('/')
  await waitForGlobe(page)

  await selectByKeyboard(page, 'theme-geospatial')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'arcgis-charts arcgis-raster')
  await expect.poll(() => rasterTiles.length).toBeGreaterThan(0)
  await expect.poll(() => chartTiles.length).toBeGreaterThan(0)
  const legend = page.getByRole('status', { name: 'Map overlay legend' })
  await expect(legend).toContainText('Last 24 hours of rain and melt')
  await expect(legend).toContainText('Greater than or equal to 10')
  await expect(legend).not.toContainText('nautical charts')
  const attribution = page.locator('.maplibregl-ctrl-attrib')
  await expect(attribution).toContainText('River Forecast Centers')
  await expect(attribution).toContainText('Office of Coast Survey')

  await selectByKeyboard(page, 'nws-api')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'hidden')
  await expect(legend).toHaveCount(0)
})

/** Every tile the page got back was a 200 PNG. */
function expectAllPng(tiles: readonly LiveTile[]) {
  for (const tile of tiles) {
    expect(tile.status).toBe(200)
    expect(tile.contentType).toContain('image/png')
  }
}

// A dry day nationally can leave the 24-hour precipitation empty, so this one only checks that a tile
// arrives; the overlays below must also draw something (#287).
test('fetches a real overlay tile @live', async ({ page }) => {
  const tiles = collectArcgisTiles(page, 'obs/rfc_qpe')
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, NODE)
  await expect.poll(() => tiles.length, { timeout: 30_000 }).toBeGreaterThan(0)
  expectAllPng(tiles)
})

test('draws real CPC outlook tiles and lists the real legend @live', async ({ page }) => {
  const tiles = collectArcgisTiles(page, 'cpc_6_10_day_outlk')
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, 'nws-gis-portal')
  await expect.poll(() => largestTileBytes(tiles), { timeout: 20_000 }).toBeGreaterThan(BLANK_TILE_MAX_BYTES)
  expectAllPng(tiles)
  await expect(page.getByRole('status', { name: 'Map overlay legend' })).toContainText(/Above, \d+%/, { timeout: 20_000 })
})

test('draws real critical habitat tiles @live', async ({ page }) => {
  // The node's coverage is worldwide, so the globe zooms out over the US, whose coasts have habitat.
  const tiles = collectArcgisTiles(page, 'All_NMFS_Critical_Habitat')
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, 'nmfs-arcgis-services')
  await expect.poll(() => largestTileBytes(tiles), { timeout: 20_000 }).toBeGreaterThan(BLANK_TILE_MAX_BYTES)
  expectAllPng(tiles)
  // The real legend's swatches have no labels, so once its call is logged there is no box (and no error).
  await page.getByRole('tab', { name: /Inspector/ }).click()
  await expect(page.getByRole('button', { name: /server\/rest\/services\/All_NMFS/ })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('status', { name: 'Map overlay legend' })).toHaveCount(0)
})

// The old NOAACharts export drew only blank tiles (#309), which a 200 PNG alone wouldn't catch. The
// ENC draws nothing below about zoom 5, so zoom in on the Gulf coast (Florida, in the node's framing).
test('draws real nautical chart tiles @live', async ({ page }) => {
  const tiles = collectArcgisTiles(page, 'MaritimeChartService')
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, 'noaa-chart-services')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'arcgis-charts')
  const box = await page.locator(`${GLOBE} canvas`).boundingBox()
  if (!box) throw new Error('no globe canvas')
  await page.mouse.move(box.x + box.width * 0.79, box.y + box.height * 0.69)
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -500)
    await page.waitForTimeout(300)
  }
  await expect.poll(() => largestTileBytes(tiles), { timeout: 20_000 }).toBeGreaterThan(BLANK_TILE_MAX_BYTES)
  expectAllPng(tiles)
})
