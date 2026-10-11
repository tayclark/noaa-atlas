// NCEI dataset list in the service detail panel (#70), from the bundled snapshot.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'
import { selectByKeyboard } from './fixtures/graph'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

test('an NCEI service lists its datasets, and other services do not', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'ncei-access-data-service')

  const section = page.getByRole('region', { name: 'Datasets' })
  await expect(section).toBeVisible()
  await section.getByText(/^Datasets \(\d+\)$/).click()
  await expect(section.getByRole('listitem').first()).toBeVisible()
  await expect(section.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//)

  await selectByKeyboard(page, 'nws-api')
  await expect(page.getByRole('region', { name: 'Datasets' })).toHaveCount(0)
})

test('the OneStop node lists the curated catalog subset', async ({ page }) => {
  await page.goto('/')
  await selectByKeyboard(page, 'onestop-search-api')

  const section = page.getByRole('region', { name: 'Datasets' })
  const summary = section.getByText(/^Datasets \(\d+\)$/)
  await expect(summary).toBeVisible()
  const count = Number((await summary.textContent())?.match(/\d+/)?.[0])
  expect(count).toBeGreaterThan(400)
  await summary.click()
  await expect(section.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//)
})

test('the AWS registry node and a bucket node list registry datasets', async ({ page }) => {
  await page.goto('/')
  for (const id of ['aws-open-data-noaa', 'hrrr-aws-open-data']) {
    await selectByKeyboard(page, id)
    const section = page.getByRole('region', { name: 'Datasets' })
    // The disclosure may stay open from the previous node, so only click it when closed.
    if (!(await section.getByRole('link').first().isVisible())) {
      await section.getByText(/^Datasets \(\d+\)$/).click()
    }
    await expect(section.getByRole('link').first()).toHaveAttribute(
      'href',
      /^https:\/\/registry\.opendata\.aws\//,
    )
  }
})
