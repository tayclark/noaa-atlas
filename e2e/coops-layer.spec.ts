// CO-OPS tide stations layer (#51): the station dots, their click popup and the linked selection,
// against mocked CO-OPS responses, plus one `@live` smoke test against the real Data API.

import { expect, test, type Page } from '@playwright/test'
import { mockCoops, mockCoopsStations } from './fixtures/coops'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const POPUP = '.maplibregl-popup-content'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

test('a station click shows its water level and predicted tides, and skips the point lookup', async ({ page }) => {
  await mockCoops(page)
  await mockPointLookup(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await page.locator(GLOBE).click()
  const popup = page.locator(POPUP)
  await expect(popup).toContainText('Test Harbor, KS')
  await expect(popup).toContainText('0.40 m')
  await expect(popup).toContainText('13:48 UTC')
  await expect(popup).toContainText('High 0.60 m at 04:34 UTC')
  await expect(popup).toContainText('Low 0.07 m at 15:46 UTC')
  await expect(popup).toContainText('Preliminary data')
  // The click belongs to the station, so the NWS point lookup didn't also open a popup.
  await expect(popup).toHaveCount(1)
  await expect(popup).not.toContainText('APIs covering this point')
})

test("shows CO-OPS's own message when a station has no water level, and still shows the tides", async ({ page }) => {
  await mockCoops(page, { waterLevelError: 'There is no MLLW for the station: 8729108' })
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await page.locator(GLOBE).click()
  await expect(page.locator(POPUP)).toContainText('Water level: There is no MLLW for the station: 8729108')
  await expect(page.locator(POPUP)).toContainText('High 0.60 m at 04:34 UTC')
})

test('selecting the CO-OPS Data API names and emphasises its live layer', async ({ page }) => {
  await mockCoops(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await selectByKeyboard(page, 'coops-data-api')
  await expect(page.getByLabel('Selection status')).toContainText('tide stations, is highlighted')
})

test('loads a real station reading @live', async ({ page }) => {
  // Only the station list is replaced (with one station at the globe centre, using a real station
  // id); the water level and predictions are real calls to api.tidesandcurrents.noaa.gov.
  await mockCoopsStations(page)
  const level = page.waitForResponse((res) => res.url().includes('product=water_level'), { timeout: 20_000 })
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await page.locator(GLOBE).click()
  expect((await level).ok()).toBe(true)
  await expect(page.locator(POPUP)).toContainText(/Water level: (-?\d+\.\d\d m|no recent reading)/, { timeout: 20_000 })
})
