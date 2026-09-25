// SWPC live layer (#54): the aurora heatmap, its click readout and the Kp corner, against mocked
// SWPC files, plus one `@live` smoke test against the real ones.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { AURORA_BAND_VALUE, AURORA_FIXTURE_POINTS, mockSwpc } from './fixtures/swpc'

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test('draws the aurora, reads it back on click and shows Kp', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockPointLookup(page)
  await mockSwpc(page)
  await page.goto('/')

  const readout = page.getByLabel('Geomagnetic activity')
  await expect(readout).toContainText('Kp 6.7 · G3 Strong storm')
  await expect(readout).toContainText('00:27 UTC')

  const globe = page.locator(GLOBE)
  await expect(globe).toHaveAttribute('data-aurora-points', String(AURORA_FIXTURE_POINTS))

  // The mocked band covers the initial centre, so the canvas centre is inside it.
  await globe.click()
  await expect(page.locator('.maplibregl-popup-content')).toContainText(`Aurora: ${AURORA_BAND_VALUE}% chance here`)
  await expect(page.locator('.maplibregl-popup-content')).toContainText('forecast for 01:22 UTC')
})

test('selecting an SWPC service names and emphasises its live layer', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-aurora-points', String(AURORA_FIXTURE_POINTS))

  const status = page.getByLabel('Selection status')
  const readout = page.getByLabel('Geomagnetic activity')

  await selectByKeyboard(page, 'swpc-ovation-aurora')
  await expect(status).toContainText('the aurora forecast glow, is highlighted')
  await expect(readout).not.toHaveClass(/space-weather-readout-highlighted/)

  await selectByKeyboard(page, 'swpc-geomagnetic-indices')
  await expect(status).toContainText('Its live Kp reading is highlighted')
  await expect(readout).toHaveClass(/space-weather-readout-highlighted/)
})

test('says so when the aurora forecast cannot be loaded', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page, { ovationStatus: 503 })
  await page.goto('/')

  const readout = page.getByLabel('Geomagnetic activity')
  await expect(readout).toContainText('Aurora forecast: SWPC is unavailable (503)')
  await expect(readout).toContainText('Kp 6.7')
  await expect(page.locator(GLOBE)).not.toHaveAttribute('data-aurora-points', /.*/)
})

test('loads the real aurora forecast and Kp @live', async ({ page }) => {
  // No SWPC mock: real calls to services.swpc.noaa.gov. Loose on purpose, since the values change
  // by the minute; it checks the calls succeed and the layer and readout appear.
  const ovation = page.waitForResponse((res) => res.url().includes('/json/ovation_aurora_latest.json'), { timeout: 20_000 })
  await page.goto('/')
  expect((await ovation).ok()).toBe(true)

  await expect(page.locator(GLOBE)).toHaveAttribute('data-aurora-points', /^\d+$/, { timeout: 20_000 })
  await expect(page.getByLabel('Geomagnetic activity')).toContainText(/Kp \d\.\d · G[0-5]/)
})
