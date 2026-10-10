// nowCOAST radar tiles (#56): drawn only while the nowCOAST node is selected, against mocked WMS
// tiles, plus one `@live` smoke test that fetches a real tile.

import { expect, test } from '@playwright/test'
import { mockArcgisRaster } from './fixtures/arcgis'
import { waitForGlobe } from './fixtures/globe'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockRadar, RADAR_FRAMES, RADAR_TILES } from './fixtures/nowcoast'
import { mockSwpc } from './fixtures/swpc'
import { selectByKeyboard } from './fixtures/graph'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const NODE = 'nowcoast-map-services'

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

test('requests no radar tiles until the nowCOAST node is selected', async ({ page }) => {
  const tiles = await mockRadar(page)
  const arcgis = await mockArcgisRaster(page)
  await page.goto('/')
  await waitForGlobe(page)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'hidden')
  // Rather than sleep and hope a stray request shows up: once another overlay's tiles are asked for,
  // the loaded map has rendered with every source it has, so this one's would have been asked for too.
  await selectByKeyboard(page, 'nws-raster-map-services')
  await expect.poll(() => arcgis.length).toBeGreaterThan(0)
  expect(tiles).toHaveLength(0)
})

test('selecting nowCOAST draws the radar with its credit, and selecting something else hides it', async ({ page }) => {
  const tiles = await mockRadar(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'hidden')

  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'visible')
  await expect(page.getByLabel('Selection status')).toContainText('current radar')
  await expect.poll(() => tiles.length).toBeGreaterThan(0)
  expect(tiles[0]).toContain('layers=base_reflectivity_mosaic')
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('nowCOAST')

  await selectByKeyboard(page, 'nws-api')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'hidden')
})

test('a time slider scrubs the radar through earlier frames, and goes with the layer', async ({ page }) => {
  const tiles = await mockRadar(page)
  await page.goto('/')
  // `data-radar-time` is set before the map loads, so wait for the map (#286): otherwise the tile
  // poll below has to cover a slow map load too.
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'hidden')
  await expect(page.getByRole('slider', { name: 'Radar frame' })).toHaveCount(0)

  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'visible')
  const slider = page.getByRole('slider', { name: 'Radar frame' })
  await expect(slider).toHaveValue(String(RADAR_FRAMES.length - 1))
  await expect(page.locator(GLOBE)).toHaveAttribute('data-radar-time', 'latest')
  await expect(page.locator('.radar-time-label')).toContainText('Latest')

  await slider.fill('0')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-radar-time', RADAR_FRAMES[0]!)
  await expect(page.locator('.radar-time-label')).toContainText('20 min earlier')
  await expect.poll(() => tiles.some((url) => url.includes(`time=${encodeURIComponent(RADAR_FRAMES[0]!)}`))).toBe(true)

  await selectByKeyboard(page, 'nws-api')
  await expect(slider).toHaveCount(0)
  await selectByKeyboard(page, NODE)
  // Only a loaded frame list can put the time back on an earlier frame, so wait for it (the slider
  // returns) before checking that leaving reset the time to the latest frame.
  await expect(slider).toHaveValue(String(RADAR_FRAMES.length - 1))
  await expect(page.locator(GLOBE)).toHaveAttribute('data-radar-time', 'latest')
})

test('the radar still draws, without a slider, when the frame list fails', async ({ page }) => {
  await mockRadar(page, { capabilities: false })
  await page.goto('/')
  const capabilities = page.waitForResponse((res) => res.url().includes('request=GetCapabilities'))
  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'visible')
  expect((await capabilities).status()).toBe(503)
  await expect(page.getByRole('slider', { name: 'Radar frame' })).toHaveCount(0)
})

test('fetches a real radar tile @live', async ({ page }) => {
  const tile = page.waitForResponse((res) => res.url().includes('/geoserver/weather_radar/wms') && res.url().includes('request=GetMap'), { timeout: 30_000 })
  await page.route(RADAR_TILES, (route) => route.continue())
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'hidden', { timeout: 20_000 })
  await selectByKeyboard(page, NODE)
  const res = await tile
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('image/png')
})
