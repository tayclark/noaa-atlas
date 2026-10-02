// Phone layout of #260: without WebGL the Globe tab explains, and the other tabs keep working.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'
import { disableWebGL } from './fixtures/webgl'

test.use({ reducedMotion: 'reduce' })

test('without WebGL the Globe tab shows the fallback and the Graph tab still renders', async ({ page }) => {
  await disableWebGL(page)
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')

  await page.getByRole('tab', { name: 'Globe' }).click()
  const status = page.getByRole('status', { name: 'Map status' })
  await expect(status).toBeVisible()
  await expect(status).toContainText('needs WebGL2')

  await page.getByRole('tab', { name: /Graph/ }).click()
  await expect(page.locator('.graph-node[data-node-id="nws-api"]')).toBeVisible()
})
