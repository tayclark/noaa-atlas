// CO-OPS try-its (#241): the Metadata and Derived Product nodes have no map layer, so Run sample
// fetches one station's records and shows tables in the detail panel, with Inspector entries.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'
import { makeHtfAnnual, makeSeaLevelTrend, makeStationMetadata } from '../src/data/coopsFixtures'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify(body),
})

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await mockPointLookup(page)
  await page.route(/^https:\/\/api\.tidesandcurrents\.noaa\.gov\/mdapi\/prod\/webapi\/stations\/8729108\.json/, (route) =>
    route.fulfill(json(makeStationMetadata())),
  )
  await page.route(/^https:\/\/api\.tidesandcurrents\.noaa\.gov\/dpapi\/prod\/webapi\/product\/sealvltrends\.json/, (route) =>
    route.fulfill(json(makeSeaLevelTrend())),
  )
  await page.route(/^https:\/\/api\.tidesandcurrents\.noaa\.gov\/dpapi\/prod\/webapi\/htf\/htf_annual\.json/, (route) =>
    route.fulfill(json(makeHtfAnnual())),
  )
})

test('the metadata node shows the station and its datums as tables', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'coops-metadata-api')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await expect(sample.getByRole('table')).toHaveCount(0)
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample).toContainText('Live response (parsed)')
  await expect(sample.getByRole('table', { name: /Panama City, FL \(8729108\)/ })).toContainText('1.94 m')
  await expect(sample.getByRole('table', { name: /^Datums/ })).toContainText('Mean Higher-High Water')
})

test('the derived product node shows the sea level trend and flood days', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'coops-derived-product-api')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample.getByRole('table', { name: 'Sea level trend at Panama City' })).toContainText('3.08 ± 0.26 mm/yr')
  await expect(sample.getByRole('table', { name: /High tide flood days/ })).toContainText('2024')
})

test('a station the Metadata API does not know reports the 404', async ({ page }) => {
  await page.route(/^https:\/\/api\.tidesandcurrents\.noaa\.gov\/mdapi\//, (route) =>
    route.fulfill(json({ errorMsg: 'No station was found for id 8729108', errorCode: 404 }, 404)),
  )
  await page.goto('/')
  await selectByKeyboard(page, 'coops-metadata-api')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample.getByRole('alert')).toContainText('CO-OPS request failed (404).')
  await expect(sample).toContainText('Static sample')
})

test('the try-it calls appear in the Inspector', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'coops-derived-product-api')
  await page.getByRole('region', { name: 'Sample call' }).getByRole('button', { name: 'Run sample' }).click()
  await expect(page.getByRole('region', { name: 'Sample call' }).getByRole('table').first()).toBeVisible()
  await page.getByRole('tab', { name: /inspector/i }).click()
  await expect(page.getByRole('button', { name: /sealvltrends/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /htf_annual/ })).toBeVisible()
})
