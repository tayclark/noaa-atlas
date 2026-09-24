// Inspector accordion and foldable response body (#150), against a mocked alerts response.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

test('logs the alerts request collapsed, and expands and folds it on demand', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  const alertsResponse = page.waitForResponse((res) => res.url().includes('/alerts/active'))
  await page.goto('/')
  await alertsResponse

  const tab = page.getByRole('tab', { name: /Inspector/ })
  await expect(tab).toContainText('1')
  await tab.click()

  const row = page.getByRole('button', { name: /\/alerts\/active/ })
  await expect(row).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('https://api.weather.gov/alerts/active')).toHaveCount(0)

  await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('https://api.weather.gov/alerts/active')).toBeVisible()
  await expect(page.locator('.json-tree-key', { hasText: 'features' })).toBeVisible()

  await row.click()
  await expect(page.locator('.json-tree')).toHaveCount(0)

  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(page.getByText(/No live requests yet/)).toBeVisible()
})
