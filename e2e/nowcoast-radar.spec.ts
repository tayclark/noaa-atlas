// nowCOAST radar tiles (#56): drawn only while the nowCOAST node is selected, against mocked WMS
// tiles, plus one `@live` smoke test that fetches a real tile.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockRadar, RADAR_TILES } from './fixtures/nowcoast'
import { mockSwpc } from './fixtures/swpc'

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const NODE = 'nowcoast-map-services'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

test('requests no radar tiles until the nowCOAST node is selected', async ({ page }) => {
  const tiles = await mockRadar(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'hidden')
  // Give a stray request time to show up before asserting that none did.
  await page.waitForTimeout(1000)
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

test('fetches a real radar tile @live', async ({ page }) => {
  const tile = page.waitForResponse((res) => res.url().includes('/geoserver/weather_radar/wms'), { timeout: 30_000 })
  await page.route(RADAR_TILES, (route) => route.continue())
  await page.goto('/')
  await selectByKeyboard(page, NODE)
  const res = await tile
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('image/png')
})
