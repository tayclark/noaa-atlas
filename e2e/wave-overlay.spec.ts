// The GFS-Wave height shading (#229): chosen with the Wind / Waves toggle once the GFS (AWS) node is
// selected, against a mocked bucket, and following the same time slider as the wind.

import { expect, test, type Page } from '@playwright/test'
import { mockGfs } from './fixtures/gfs'
import { GLOBE, waitForGlobe } from './fixtures/globe'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

test.use({ reducedMotion: 'reduce' })

// Decoding the JPEG 2000 wave field on the main thread took seconds on a CI runner, so loads get more room.
const LOADED = { timeout: 30_000 }

const NODE = 'gfs-aws-open-data'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

test('shows wind first and requests no wave data until Waves is chosen', async ({ page }) => {
  const seen = await mockGfs(page)
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'visible', LOADED)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-waves', 'hidden')
  expect(seen.some((r) => r.url.includes('/wave/'))).toBe(false)
})

test('Waves loads the HTSGW field with one Range request and swaps the slider and legend', async ({ page }) => {
  const seen = await mockGfs(page)
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'visible', LOADED)

  await page.locator('.wind-layer-toggle').getByRole('button', { name: 'Waves' }).click()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-waves', 'visible', LOADED)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'hidden')
  await expect(page.getByRole('slider', { name: 'Wave forecast hour' })).toBeVisible()
  await expect(page.getByLabel('Wave height legend')).toContainText('GFS-Wave')
  expect(seen.some((r) => r.range?.startsWith('bytes=3085809-'))).toBe(true)

  await page.locator('.wind-layer-toggle').getByRole('button', { name: 'Wind' }).click()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'visible', LOADED)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-waves', 'hidden')
})

test('the slider loads the wave hours around the shared time', async ({ page }) => {
  const seen = await mockGfs(page)
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, NODE)
  await page.locator('.wind-layer-toggle').getByRole('button', { name: 'Waves' }).click()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-waves', 'visible', LOADED)

  const slider = page.getByRole('slider', { name: 'Wave forecast hour' })
  await slider.focus()
  await page.keyboard.press('End')
  await expect(page.locator('.wind-control .radar-time-label')).toContainText('+120 h')
  await expect.poll(() => seen.some((r) => r.url.includes('/wave/') && r.url.includes('.f120.grib2')), LOADED).toBe(true)
})

test('says so when the wave files are unreachable, and wind still works', async ({ page }) => {
  await mockGfs(page)
  await page.route('https://noaa-gfs-bdp-pds.s3.amazonaws.com/**/wave/**', (route) => route.fulfill({ status: 503, body: '' }))
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, NODE)
  await page.locator('.wind-layer-toggle').getByRole('button', { name: 'Waves' }).click()
  await expect(page.getByLabel('Wave status')).toContainText('could not be loaded')
  await page.getByRole('button', { name: 'Show wind instead' }).click()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'visible', LOADED)
})
