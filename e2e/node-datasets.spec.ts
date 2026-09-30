// NCEI dataset list in the service detail panel (#70), from the bundled snapshot.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

test('an NCEI service lists its datasets, and other services do not', async ({ page }) => {
  await page.goto('/')
  await page.locator('.graph-node[data-node-id="ncei-access-data-service"]').focus()
  await page.keyboard.press('Enter')

  const section = page.getByRole('region', { name: 'Datasets' })
  await expect(section).toBeVisible()
  await section.getByText(/^Datasets \(\d+\)$/).click()
  await expect(section.getByRole('listitem').first()).toBeVisible()
  await expect(section.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//)

  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Datasets' })).toHaveCount(0)
})

test('the OneStop node lists the curated catalog subset', async ({ page }) => {
  await page.goto('/')
  await page.locator('.graph-node[data-node-id="onestop-search-api"]').focus()
  await page.keyboard.press('Enter')

  const section = page.getByRole('region', { name: 'Datasets' })
  const summary = section.getByText(/^Datasets \(\d+\)$/)
  await expect(summary).toBeVisible()
  const count = Number((await summary.textContent())?.match(/\d+/)?.[0])
  expect(count).toBeGreaterThan(400)
  await summary.click()
  await expect(section.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//)
})
