// The globe out of sight (#78): its Globe tab stays mounted while another shows, so what it does in
// the background has to stop: the radar loop and the space-weather polling both pause, and come
// back when the tab is seen. The radar slider has finger-sized steps.

import { expect, test, type Page } from '@playwright/test'
import { RADAR_FRAMES, mockRadar } from './fixtures/nowcoast'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc, mockSwpcRefresh } from './fixtures/swpc'

// The graph is only used to pick a node here, so skip its ~6.5 s animated settle.
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const NOWCOAST = 'nowcoast-map-services'

async function selectNowcoast(page: Page) {
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
  await page.locator(`.graph-node[data-node-id="${NOWCOAST}"]`).focus()
  await page.keyboard.press('Enter')
}

async function openRadar(page: Page) {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await mockRadar(page)
  await page.goto('/')
  await selectNowcoast(page)
  await page.getByRole('tab', { name: /Globe/ }).tap()
  await expect(page.getByRole('slider', { name: 'Radar frame' })).toBeVisible({ timeout: 20_000 })
}

const radarTime = (page: Page) => page.locator(GLOBE).getAttribute('data-radar-time')

test('the radar loop stops while another tab shows, and goes on when the globe is seen again', async ({ page }) => {
  await openRadar(page)
  await page.getByRole('button', { name: 'Play radar loop' }).tap()
  await expect.poll(() => radarTime(page)).not.toBe('latest')

  await page.getByRole('tab', { name: /Graph/ }).tap()
  // Let a tick that was already due go by, then see that no more arrive.
  await page.waitForTimeout(900)
  const held = await radarTime(page)
  await page.waitForTimeout(2300)
  expect(await radarTime(page)).toBe(held)

  await page.getByRole('tab', { name: /Globe/ }).tap()
  await expect.poll(() => radarTime(page), { timeout: 5000 }).not.toBe(held)
})

test('the radar steps a frame at a time with finger-sized buttons, and a tall slider', async ({ page }) => {
  await openRadar(page)
  const previous = page.getByRole('button', { name: 'Previous radar frame' })
  const next = page.getByRole('button', { name: 'Next radar frame' })

  for (const control of [previous, next, page.getByRole('button', { name: 'Play radar loop' })]) {
    const box = (await control.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  expect((await page.getByRole('slider', { name: 'Radar frame' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)

  // Opens on the latest frame: nothing later to step to.
  await expect(next).toBeDisabled()
  await previous.tap()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-radar-time', RADAR_FRAMES[1]!)
  await previous.tap()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-radar-time', RADAR_FRAMES[0]!)
  await expect(previous).toBeDisabled()
  await next.tap()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-radar-time', RADAR_FRAMES[1]!)
})

test('the radar\'s time has a line of its own on a phone, clear of the buttons', async ({ page }) => {
  await openRadar(page)
  const label = (await page.locator('.radar-time-label').boundingBox())!
  const next = (await page.getByRole('button', { name: 'Next radar frame' }).boundingBox())!
  expect(label.y).toBeGreaterThanOrEqual(next.y + next.height - 1)
})

test('the space-weather readout is not refreshed while the globe is hidden, and is at once when it is seen', async ({ page }) => {
  await page.clock.install()
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpcRefresh(page)
  await page.goto('/')
  await page.getByRole('tab', { name: /Globe/ }).tap()
  const readout = page.getByLabel('Geomagnetic activity')
  await expect(readout).toContainText('Kp 6.7')

  await page.getByRole('tab', { name: /Graph/ }).tap()
  await page.clock.fastForward(12 * 60_000)
  await page.clock.runFor(500)
  // Two refresh intervals have passed with the globe out of sight, and nothing was fetched for it.
  await expect(readout).toContainText('Kp 6.7')

  await page.getByRole('tab', { name: /Globe/ }).tap()
  await expect(readout).toContainText('Kp 5.3 · G1 Minor storm')
})
