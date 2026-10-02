// The globe fails on its own (#260): without WebGL2, or with the basemap down, the globe pane says
// why and the rest of the app keeps working.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'
import { disableWebGL } from './fixtures/webgl'

test.use({ reducedMotion: 'reduce' })

test('without WebGL the globe pane explains, and the graph, detail and Inspector still work', async ({ page }) => {
  await disableWebGL(page)
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')

  const status = page.getByRole('status', { name: 'Map status' })
  await expect(status).toContainText('Globe unavailable')
  await expect(status).toContainText('needs WebGL2')
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0)

  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Node detail')).toBeVisible()

  await page.getByRole('tab', { name: /Inspector/ }).click()
  await expect(page.getByRole('tab', { name: /Inspector/ })).toHaveAttribute('aria-selected', 'true')
})

test('a basemap that fails to load shows a status message over the globe', async ({ page }) => {
  await page.route(/tiles\.openfreemap\.org\/styles\//, (route) => route.fulfill({ status: 503, body: 'unavailable' }))
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')

  const status = page.getByRole('status', { name: 'Map status' })
  await expect(status).toContainText("The basemap couldn't load (HTTP 503)")
  // `load` never fired, so no live layer was added.
  await expect(page.getByRole('group', { name: 'Globe view of NOAA API coverage' })).not.toHaveAttribute('data-coops-stations', /.*/)
  await expect(page.locator('.graph-node[data-node-id="nws-api"]')).toBeAttached()
})
