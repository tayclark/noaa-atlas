// SPC Day 1 convective outlook layer: fetched and drawn only while the SPC node is selected, with
// a legend, a click popup and an Inspector entry.

import { expect, test, type Page } from '@playwright/test'
import { GLOBE, waitForGlobe } from './fixtures/globe'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSpcOutlook, SPC_URL } from './fixtures/spc'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const POPUP = '.maplibregl-popup-content'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await mockPointLookup(page)
})

test('the outlook is requested and drawn only while the SPC node is selected', async ({ page }) => {
  let requests = 0
  await mockSpcOutlook(page)
  await page.route(SPC_URL, (route) => {
    requests += 1
    return route.fallback()
  })
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-spc-outlook', 'hidden')
  expect(requests).toBe(0)

  await selectByKeyboard(page, 'spc-gis-data')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-spc-outlook', 'ok')
  expect(requests).toBe(1)
  const legend = page.getByRole('status', { name: 'Convective outlook legend' })
  await expect(legend).toContainText('Slight')

  await selectByKeyboard(page, 'nws-api')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-spc-outlook', 'hidden')
  await expect(legend).toHaveCount(0)
})

test('a click on the outlook shows its category and the request lands in the Inspector', async ({ page }) => {
  await mockSpcOutlook(page)
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, 'spc-gis-data')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-spc-outlook', 'ok')

  await page.locator(GLOBE).click()
  const popup = page.locator(POPUP)
  await expect(popup).toContainText('Slight Risk')
  await expect(popup).toContainText('Test Forecaster')
  await expect(popup).not.toContainText('APIs covering this point')

  await page.getByRole('tab', { name: /Inspector/ }).click()
  await expect(page.getByRole('button', { name: /day1otlk_cat/ })).toBeVisible()
})

test('a quiet day and a failed fetch say so', async ({ page }) => {
  await mockSpcOutlook(page, { type: 'FeatureCollection', features: [] })
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, 'spc-gis-data')
  await expect(page.getByRole('status', { name: 'Convective outlook status' })).toContainText('No convective outlook areas')

  await page.unroute(SPC_URL)
  await page.route(SPC_URL, (route) => route.fulfill({ status: 503, body: '' }))
  await page.reload()
  await waitForGlobe(page)
  await selectByKeyboard(page, 'spc-gis-data')
  await expect(page.getByRole('status', { name: 'Convective outlook status' })).toContainText('unavailable')
})
