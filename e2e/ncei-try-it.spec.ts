// NCEI try-its (#242): the Access Data Service and GOES-R archive nodes have no map layer, so Run
// sample shows a station's recent daily summaries or the archive's latest files as a table in the
// detail panel, with Inspector entries.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'
import { makeDailySummaries, makeGoesListingHtml } from '../src/data/nceiFixtures'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const ADS = /^https:\/\/www\.ncei\.noaa\.gov\/access\/services\/data\/v1\?/
const GOES_ARCHIVE = /^https:\/\/data\.ngdc\.noaa\.gov\/platforms\/solar-space-observing-satellites\/goes\/goes19\//

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

const reply = (body: string, contentType: string, status = 200) => ({
  status,
  contentType,
  headers: { 'access-control-allow-origin': '*' },
  body,
})

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await mockPointLookup(page)
  await page.route(ADS, (route) => route.fulfill(reply(JSON.stringify(makeDailySummaries()), 'application/json')))
  await page.route(GOES_ARCHIVE, (route) => route.fulfill(reply(makeGoesListingHtml(), 'text/html')))
})

test('the Access Data node shows recent daily summaries as a table', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'ncei-access-data-service')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await expect(sample.getByRole('table')).toHaveCount(0)
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample).toContainText('Live response (parsed)')
  const table = sample.getByRole('table', { name: /GHCN-Daily at ATLANTA HARTSFIELD/ })
  await expect(table.getByRole('row').nth(1)).toContainText('2026-10-04')
  await expect(table).toContainText('9.1 mm')
})

test('the GOES-R archive node lists the latest files', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'ncei-goes-r-space-weather')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample.getByRole('table', { name: /GOES-19 XRS one-minute flux files/ })).toContainText('sci_xrsf-l2-avg1m_g19_d20261003_v2-2-1.nc')
})

test('a month the archive has not started falls back to the previous one', async ({ page }) => {
  let calls = 0
  await page.route(GOES_ARCHIVE, (route) =>
    route.fulfill(calls++ === 0 ? reply('Not Found', 'text/html', 404) : reply(makeGoesListingHtml(), 'text/html')),
  )
  await page.goto('/')
  await selectByKeyboard(page, 'ncei-goes-r-space-weather')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample.getByRole('table', { name: /GOES-19 XRS/ })).toContainText('2026-10-03')
  expect(calls).toBe(2)
})

test('a failed Access Data call reports the status and keeps the static sample', async ({ page }) => {
  await page.route(ADS, (route) => route.fulfill(reply('{}', 'application/json', 503)))
  await page.goto('/')
  await selectByKeyboard(page, 'ncei-access-data-service')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample.getByRole('alert')).toContainText('NCEI request failed (503).')
  await expect(sample).toContainText('Static sample')
})

test('the try-it calls appear in the Inspector', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'ncei-access-data-service')
  await page.getByRole('region', { name: 'Sample call' }).getByRole('button', { name: 'Run sample' }).click()
  await expect(page.getByRole('region', { name: 'Sample call' }).getByRole('table')).toBeVisible()
  await page.getByRole('tab', { name: /inspector/i }).click()
  await expect(page.getByRole('button', { name: /access\/services\/data\/v1/ })).toBeVisible()
})
