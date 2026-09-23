// AC2: live layer render with mocked network, plus one live NWS smoke test (#46). The mocked
// test proves the alerts layer actually renders and is clickable; the `@live` test hits real
// api.weather.gov and is deliberately loose (status-only, no content assertions) since real
// alert data is nondeterministic day to day — tagged so `--grep`/`--grep-invert` can split it
// from the deterministic mocked suite for local dev convenience (CI runs both).

import { expect, test } from '@playwright/test'
import { mappableAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'

test('renders the NWS alerts layer from a mocked response', async ({ page }) => {
  await mockAlerts(page, mappableAlertsFixture())
  const responsePromise = page.waitForResponse((res) => res.url().includes('/alerts/active'))
  await page.goto('/')

  const globe = page.locator(GLOBE)
  await expect(globe).toBeVisible()
  await responsePromise
  // Give MapLibre a beat to add the alerts source/layer after the mocked response resolves —
  // there's no exposed map-ready hook to await directly (see e2e/live-layer.spec.ts's `@live`
  // test for the same constraint).
  await page.waitForTimeout(500)

  // The mocked alert polygon straddles the map's initial center, so clicking the canvas's
  // on-screen center lands inside it.
  await globe.click()

  await expect(page.getByText('Flood Warning')).toBeVisible()
  await expect(page.getByText('Test County')).toBeVisible()
  await expect(page.locator('.zone-only-alerts', { hasText: 'No active alerts.' })).toHaveCount(0)
})

test('renders live NWS alerts @live', async ({ page }) => {
  // No route mock — real network call to api.weather.gov. Waits on the actual HTTP response
  // (not just DOM state) so this is a genuine smoke test of the live call succeeding, kept
  // deliberately narrow — no assertions on real alert content, since that's nondeterministic
  // day to day.
  const responsePromise = page.waitForResponse((res) => res.url().includes('/alerts/active'), {
    timeout: 15_000,
  })
  await page.goto('/')
  const response = await responsePromise
  expect(response.ok()).toBe(true)

  const errorBanner = page.locator('[aria-label="Alerts status"]', { hasText: /error|failed|exceeded|rejected/i })
  await expect(errorBanner).toHaveCount(0)
})
