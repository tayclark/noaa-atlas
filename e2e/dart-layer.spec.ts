// DART tsunami buoys layer (#80): drawn only while the NDBC DART node is selected, with a click
// popup that links the buoy's NDBC page.

import { expect, test, type Page } from '@playwright/test'
import { mockDartStations } from './fixtures/dart'
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
  await mockDartStations(page)
  await mockPointLookup(page)
})

test('the buoys appear only while the DART node is selected, and a click shows the buoy', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-dart-stations', '0')

  await selectByKeyboard(page, 'ndbc-dart-realtime')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-dart-stations', '1')

  await page.locator(GLOBE).click()
  const popup = page.locator(POPUP)
  await expect(popup).toContainText('Test Buoy')
  await expect(popup.getByRole('link', { name: 'NDBC station page' })).toHaveAttribute('href', /station=21414/)
  // The click belongs to the buoy, so the NWS point lookup didn't also open a popup.
  await expect(popup).toHaveCount(1)
  await expect(popup).not.toContainText('APIs covering this point')

  await selectByKeyboard(page, 'nws-api')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-dart-stations', '0')
})
