// The point forecast timeline (#228): wind, waves and tide for a tapped point, scrubbed with the
// shared time. Against mocked NWS and CO-OPS responses.

import { expect, test } from '@playwright/test'
import { mockCoops } from './fixtures/coops'
import { mockRadar } from './fixtures/nowcoast'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockGridpointData, mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const TIMELINE = '[aria-label="Point forecast timeline"]'

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await mockPointLookup(page)
})

test('tapping a station shows wind, waves and its tide, and scrubbing moves the cursor', async ({ page }) => {
  await mockGridpointData(page)
  await mockCoops(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await page.locator(GLOBE).click()
  const timeline = page.locator(TIMELINE)
  await expect(timeline.locator('.forecast-timeline-wind')).toBeVisible()
  await expect(timeline.locator('.forecast-timeline-waves')).toBeVisible()
  await expect(timeline.locator('.forecast-timeline-tide')).toBeVisible()
  await expect(timeline).toContainText('Tide: Test Harbor')
  await expect(timeline.locator('.forecast-timeline-now-marker')).toBeAttached()

  const readout = timeline.locator('.forecast-timeline-readout')
  const before = await readout.getAttribute('data-forecast-time')
  await timeline.getByRole('button', { name: 'Next forecast hour' }).click()
  await expect(readout).not.toHaveAttribute('data-forecast-time', before ?? '')
  await expect(readout).toContainText('wind')
  await expect(readout).toContainText('SW')

  await timeline.getByRole('button', { name: 'Now' }).click()
  await expect(readout).toHaveAttribute('data-forecast-time', before ?? '')
})

test('a point with no wave forecast drops the wave row and says so', async ({ page }) => {
  await mockGridpointData(page, { waves: false })
  await mockCoops(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await page.locator(GLOBE).click()
  const timeline = page.locator(TIMELINE)
  await expect(timeline.locator('.forecast-timeline-wind')).toBeVisible()
  await expect(timeline.locator('.forecast-timeline-waves')).toHaveCount(0)
  await expect(timeline).toContainText('No wave forecast for this point.')
})

test('a failed forecast says so and can be retried', async ({ page }) => {
  await mockGridpointData(page)
  // Registered after the mock, so it is asked first and hands over once the outage is over.
  let fail = true
  await page.route('**/gridpoints/TOP/31,80', (route) =>
    fail ? route.fulfill({ status: 503, json: {} }) : route.fallback(),
  )
  await mockCoops(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await page.locator(GLOBE).click()
  const timeline = page.locator(TIMELINE)
  await expect(timeline).toContainText('NWS service error')
  fail = false
  await timeline.getByRole('button', { name: 'Try again' }).click()
  await expect(timeline.locator('.forecast-timeline-wind')).toBeVisible()
})

test('only one time control plays at a time: starting the timeline stops the radar loop', async ({ page }) => {
  await mockGridpointData(page)
  await mockRadar(page)
  await page.goto('/')
  await page.locator('.graph-node[data-node-id="nowcoast-map-services"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nowcoast-radar', 'visible')
  await page.locator(GLOBE).click()

  const timeline = page.locator(TIMELINE)
  await expect(timeline.locator('.forecast-timeline-wind')).toBeVisible()
  await page.getByRole('button', { name: 'Play radar loop' }).click()
  await expect(page.getByRole('button', { name: 'Pause radar loop' })).toBeVisible()

  await timeline.getByRole('button', { name: 'Play forecast loop' }).click()
  await expect(timeline.getByRole('button', { name: 'Pause forecast loop' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play radar loop' })).toBeVisible()
})
