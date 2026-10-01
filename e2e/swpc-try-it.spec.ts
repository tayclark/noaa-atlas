// SWPC try-its (#240): the alerts, solar wind and GOES nodes have no map layer, so Run sample fetches
// the feed and shows a table in the detail panel, with an Inspector entry.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'
import { makeAlerts, makeScales, makeSolarWindRows, makeXrayRows } from '../src/data/swpcFixtures'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await mockPointLookup(page)
  const json = (body: unknown) => ({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await page.route(/services\.swpc\.noaa\.gov\/products\/noaa-scales\.json/, (route) => route.fulfill(json(makeScales())))
  await page.route(/services\.swpc\.noaa\.gov\/products\/alerts\.json/, (route) => route.fulfill(json(makeAlerts())))
  await page.route(/services\.swpc\.noaa\.gov\/json\/rtsw\/rtsw_wind_1m\.json/, (route) => route.fulfill(json(makeSolarWindRows(12))))
  await page.route(/services\.swpc\.noaa\.gov\/json\/goes\/primary\/xrays-6-hour\.json/, (route) => route.fulfill(json(makeXrayRows(12))))
})

test('the alerts node shows the scales and the latest alerts as tables', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'swpc-alerts-scales')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await expect(sample.getByRole('table')).toHaveCount(0)
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample).toContainText('Live response (parsed)')
  await expect(sample.getByRole('table', { name: 'NOAA space weather scales' })).toContainText('G1 minor')
  await expect(sample.getByRole('table', { name: /alerts, watches and warnings/ })).toContainText('WATCH: Geomagnetic Storm Category G1 Predicted')
})

test('the solar wind and GOES nodes each show a series table', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'swpc-rtsw-solar-wind')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample.getByRole('table', { name: /Solar wind at L1/ })).toContainText('430')

  await selectByKeyboard(page, 'swpc-goes-space-environment')
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample.getByRole('table', { name: /X-ray flux/ })).toContainText('B2.4')
})

test('a try-it call appears in the Inspector', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'swpc-goes-space-environment')
  await page.getByRole('region', { name: 'Sample call' }).getByRole('button', { name: 'Run sample' }).click()
  await expect(page.getByRole('region', { name: 'Sample call' }).getByRole('table')).toBeVisible()
  await page.getByRole('tab', { name: /inspector/i }).click()
  await expect(page.getByRole('button', { name: /xrays-6-hour/ })).toBeVisible()
})
