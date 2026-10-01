// Compare tab (#76): services picked from the detail panel or a task, side by side.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
})

test('services added from the detail panel appear side by side in the Compare tab', async ({ page }) => {
  await selectByKeyboard(page, 'nws-api')
  await page.getByLabel('Node detail').getByRole('button', { name: 'Add to compare' }).click()
  await selectByKeyboard(page, 'swpc-ovation-aurora')
  await page.getByLabel('Node detail').getByRole('button', { name: 'Add to compare' }).click()

  const tab = page.getByRole('tab', { name: /Compare/ })
  await expect(tab).toContainText('2')
  await tab.click()

  const region = page.getByRole('region', { name: 'Compare services' })
  await expect(region.getByRole('columnheader')).toHaveCount(2)
  await expect(region.getByRole('rowheader', { name: 'Auth' })).toBeVisible()
  await expect(region.getByRole('rowheader', { name: 'Coverage' })).toBeVisible()

  await region.getByRole('button', { name: /^Remove .* from compare$/ }).first().click()
  await expect(region.getByText(/Pick at least two services/)).toBeVisible()
})

test('"Compare these" adds a task\'s recommended nodes', async ({ page }) => {
  await page.getByRole('button', { name: 'See severe thunderstorm or tornado risk' }).click()
  await page.getByRole('button', { name: 'Compare these' }).click()
  await page.getByRole('tab', { name: /Compare/ }).click()
  await expect(page.getByRole('region', { name: 'Compare services' }).getByRole('columnheader')).toHaveCount(2)
})
