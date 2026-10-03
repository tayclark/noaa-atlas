// index.html paints a header and a loading status before the bundle arrives (#271), and React
// replaces it on mount. The dev server serves the entry as its source module, so holding that one
// request stands in for a slow network.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

test.use({ reducedMotion: 'reduce' })

test('the shell shows while the bundle loads and gives way to the app', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  let release = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route(/\/src\/main\.tsx/, async (route) => {
    await released
    await route.continue()
  })

  // A module script delays DOMContentLoaded, so don't wait for it while the entry is held.
  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('.app-shell-header')).toContainText('NOAA Atlas')
  await expect(page.locator('.app-shell-status')).toHaveText('Loading the atlas…')

  release()
  await expect(page.locator('.app-title')).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveCount(0)
})
