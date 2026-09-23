// Graph search (#33): matches highlight, the rest dim, and a no-results message appears.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

test('searching dims non-matching nodes and reports no results', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await page.getByRole('tab', { name: 'Graph' }).click()

  const search = page.getByRole('searchbox', { name: 'Search graph' })
  await search.fill('tornado')
  await expect(page.locator('.graph-node[data-node-id="spc-gis-data"]')).toHaveClass(/graph-node-match/)
  await expect(page.locator('.graph-node[data-node-id="nws-api"]')).toHaveClass(/graph-node-dimmed/)

  await search.fill('xyzzy')
  await expect(page.getByRole('status')).toHaveText('No matches for "xyzzy"')
})
