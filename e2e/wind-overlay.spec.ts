// The GFS wind overlay (#229): drawn only while the GFS (AWS) node is selected, against a mocked
// bucket, and following the shared time slider.

import { expect, test, type Page } from '@playwright/test'
import { mockGfs } from './fixtures/gfs'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const NODE = 'gfs-aws-open-data'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

test('requests no wind data until the GFS node is selected', async ({ page }) => {
  const seen = await mockGfs(page)
  await page.goto('/')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'hidden')
  await page.waitForTimeout(1000)
  expect(seen).toHaveLength(0)
})

test('selecting GFS loads the field with Range requests and shows the slider and legend', async ({ page }) => {
  const seen = await mockGfs(page)
  await page.goto('/')
  await selectByKeyboard(page, NODE)

  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'visible')
  await expect(page.getByLabel('Selection status')).toContainText('10 m wind forecast')
  await expect(page.getByRole('slider', { name: 'Wind forecast hour' })).toBeVisible()
  await expect(page.getByLabel('Wind speed legend')).toContainText('NOAA/NCEP GFS')
  expect(seen.some((r) => r.range?.startsWith('bytes=35505644-'))).toBe(true)
  expect(seen.some((r) => r.range?.startsWith('bytes=35584767-'))).toBe(true)
})

test('the slider moves the shared time and loads the hours around it', async ({ page }) => {
  const seen = await mockGfs(page)
  await page.goto('/')
  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'visible')
  const before = seen.length

  const slider = page.getByRole('slider', { name: 'Wind forecast hour' })
  await slider.focus()
  await page.keyboard.press('End')
  await expect(slider).toHaveValue('40')
  await expect(page.locator('.wind-control .radar-time-label')).toContainText('+120 h')
  await expect.poll(() => seen.length).toBeGreaterThan(before)
  expect(seen.some((r) => r.url.includes('.f120'))).toBe(true)

  await page.locator('.wind-now').click()
  await expect(page.locator('.wind-now')).toHaveAttribute('aria-pressed', 'true')
})

test('selecting another service hides the overlay and its controls', async ({ page }) => {
  await mockGfs(page)
  await page.goto('/')
  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'visible')

  await selectByKeyboard(page, 'nws-api')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-wind', 'hidden')
  await expect(page.getByRole('slider', { name: 'Wind forecast hour' })).toHaveCount(0)
})

test('says so when the bucket is unreachable', async ({ page }) => {
  await page.route('https://noaa-gfs-bdp-pds.s3.amazonaws.com/**', (route) => route.fulfill({ status: 503, body: '' }))
  await page.goto('/')
  await selectByKeyboard(page, NODE)
  await expect(page.getByLabel('Wind status')).toContainText('could not be loaded')
})
