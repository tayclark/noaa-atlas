// The globe's "locate me" button: with location granted, it runs the same forecast and coverage
// lookup as a click, at the user's position; when the request is refused, it says why.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'

test.describe('with location allowed', () => {
  test.use({ geolocation: { latitude: 39.05, longitude: -95.68 }, permissions: ['geolocation'] })

  test('locating the user opens the point forecast there', async ({ page }) => {
    await mockAlerts(page, emptyAlertsFixture())
    await mockPointLookup(page)
    await page.goto('/')

    const pointRequest = page.waitForRequest((req) => req.url().includes('/points/'))
    await page.getByRole('button', { name: 'Find my location' }).click()
    // The mocked point lookup is keyed on the granted position, so this is the user's fix, not the map centre.
    expect((await pointRequest).url()).toContain('/points/39.05')
    await expect(page.locator('.maplibregl-popup')).toContainText('Sunny')
    await expect(page.locator('.maplibregl-user-location-dot')).toBeVisible()
  })
})

test.describe('with location not granted', () => {
  test('a refused request explains how to allow it, and can be dismissed', async ({ page }) => {
    await mockAlerts(page, emptyAlertsFixture())
    await page.goto('/')

    // Headless Chromium refuses a location request it hasn't been granted.
    await page.getByRole('button', { name: 'Find my location' }).click()
    const status = page.getByLabel('Location status')
    await expect(status).toContainText('Location access is blocked')
    await status.getByRole('button', { name: 'Dismiss' }).click()
    await expect(status).toHaveCount(0)
  })
})
