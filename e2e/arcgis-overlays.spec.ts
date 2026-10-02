// ArcGIS MapServer overlays (#247): drawn only while their node is selected, against mocked export
// tiles and legend, plus one `@live` smoke test that fetches a real tile.

import { expect, test, type Page } from '@playwright/test'
import { mockArcgisCharts, mockArcgisRaster, mockArcgisVector } from './fixtures/arcgis'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
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
  await selectByKeyboard(page, NODE)
  await expect(page.getByRole('status', { name: 'Map overlay legend' })).toBeVisible()
  await page.getByRole('tab', { name: /Inspector/ }).click()
  await expect(page.getByRole('button', { name: /raster\/rest\/services\/obs\/rfc_qpe/ })).toBeVisible()
})

test('the overlay still draws, with a message, when the legend fails', async ({ page }) => {
  const tiles = await mockArcgisRaster(page, { legend: false })
  await page.goto('/')
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

test('the NOAA chart services node draws the charts and says they are not for navigation', async ({ page }) => {
  const tiles = await mockArcgisCharts(page)
  await page.goto('/')
  await selectByKeyboard(page, 'noaa-chart-services')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-arcgis-overlay', 'arcgis-charts')
  await expect(page.getByLabel('Selection status')).toContainText('not for navigation')
  await expect.poll(() => tiles.length).toBeGreaterThan(0)
  expect(tiles[0]).toContain('layers=show:0')
  await expect(page.getByRole('status', { name: 'Map overlay legend' })).toHaveCount(0)
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Office of Coast Survey')
})

test('fetches a real overlay tile @live', async ({ page }) => {
  let status = 0
  page.on('response', (res) => {
    if (res.url().includes('/rfc_qpe/MapServer/export')) status = res.status()
  })
  await page.goto('/')
  await selectByKeyboard(page, NODE)
  await expect.poll(() => status, { timeout: 30_000 }).toBe(200)
})
