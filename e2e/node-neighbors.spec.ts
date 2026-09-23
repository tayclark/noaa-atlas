// Neighbors and relationships in the node detail panel (#32).

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test('detail panel lists neighbors and navigates to one', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockPointLookup(page)
  await page.goto('/')

  await selectByKeyboard(page, 'nws-gis-portal')
  const panel = page.getByRole('region', { name: 'Relationships' })
  await expect(panel).toContainText('Data flow')
  await expect(panel.getByRole('button', { name: 'SPC GIS Data Feeds' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'WPC GIS Products' })).toBeVisible()

  await panel.getByRole('button', { name: 'SPC GIS Data Feeds' }).click()
  await expect(page.getByLabel('Node detail').getByRole('heading', { name: 'SPC GIS Data Feeds' })).toBeVisible()
})
