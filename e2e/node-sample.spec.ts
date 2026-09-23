// Node sample call (#31): static sample for non-live nodes, runnable sample for the live NWS node.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'

// Keyboard activation avoids geometry: the graph re-frames after each selection, so a later node
// can end up under the globe pane.
async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test('non-live node shows a static sample; live node can run it', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockPointLookup(page)
  await page.goto('/')

  await selectByKeyboard(page, 'spc-gis-data')
  const sample = page.getByRole('region', { name: 'Sample call' })
  await expect(sample).toContainText('Static sample')
  await expect(sample.getByRole('button', { name: 'Run sample' })).toHaveCount(0)

  await selectByKeyboard(page, 'nws-api')
  await expect(sample).toContainText('Static sample')
  await sample.getByRole('button', { name: 'Run sample' }).click()
  await expect(sample).toContainText('Live response (parsed)')
  await expect(sample).toContainText('"gridId": "TOP"')
})
