// NDBC buoys layer: drawn only while the NDBC realtime node is selected, with a click
// popup that links the buoy's NDBC page.

import { expect, test, type Page } from '@playwright/test'
import { mockNdbcStations } from './fixtures/ndbc'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const POPUP = '.maplibregl-popup-content'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await mockNdbcStations(page)
  await mockPointLookup(page)
})

test('the buoys appear only while the NDBC node is selected, and a click shows the buoy', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-ndbc-stations', '0')

  await selectByKeyboard(page, 'ndbc-realtime')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-ndbc-stations', '1')

  await page.locator(GLOBE).click()
  const popup = page.locator(POPUP)
  await expect(popup).toContainText('Test Buoy')
  await expect(popup.getByRole('link', { name: 'NDBC station page' })).toHaveAttribute('href', /station=41001/)
  // The click belongs to the buoy, so the NWS point lookup didn't also open a popup.
  await expect(popup).toHaveCount(1)
  await expect(popup).not.toContainText('APIs covering this point')

  await selectByKeyboard(page, 'nws-api')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-ndbc-stations', '0')
})
