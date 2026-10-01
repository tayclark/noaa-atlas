// The globe under a finger (#78): a tap reaches a station dot from beside it, one popup opens at a
// time and it scrolls rather than running off the globe, the locate button says when it is waiting,
// and a tap on the globe no longer takes the selected service's layer away.

import { expect, test, type Page } from '@playwright/test'
import { mockCoops } from './fixtures/coops'
import { mockNdbcStations } from './fixtures/ndbc'
import { emptyAlertsFixture, mappableAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'
import { pinch, swipe } from './fixtures/touch'

// The graph is only used to pick a node here, so skip its ~6.5 s animated settle.
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const POPUP = '.maplibregl-popup-content'

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

/**
 * Opens the Globe tab and returns the centre of the map, where the mocked stations are. A phone's
 * globe opens zoomed out to fit the US, where the tide stations aren't drawn yet (they'd read as
 * noise), so `zoomIn` pinches in to where they are.
 */
async function openGlobe(page: Page, { zoomIn = false } = {}) {
  await page.goto('/')
  await page.getByRole('tab', { name: /Globe/ }).tap()
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  // The map answers taps only once its style has loaded, which is when it publishes its station count.
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', /\d+/, { timeout: 20_000 })
  const box = (await page.locator(GLOBE).boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
  if (zoomIn) {
    await pinch(page, centre, 60, 220)
    await page.waitForTimeout(600)
  }
  return centre
}

test('a tap beside a station dot, within reach of it, opens that station and not a point lookup', async ({ page }) => {
  await mockCoops(page)
  await mockPointLookup(page)
  const centre = await openGlobe(page, { zoomIn: true })
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  // The dot is 3 to 6px across, and this is 18px from its centre.
  await page.touchscreen.tap(centre.x + 14, centre.y + 11)
  const popup = page.locator(POPUP)
  await expect(popup).toContainText('Test Harbor, KS')
  await expect(popup).toHaveCount(1)
  await expect(popup).not.toContainText('APIs covering this point')
})

test('a tap well clear of a station looks up the point instead', async ({ page }) => {
  await mockCoops(page)
  await mockPointLookup(page)
  const centre = await openGlobe(page)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await page.touchscreen.tap(centre.x + 90, centre.y + 40)
  await expect(page.locator(POPUP)).toContainText('APIs covering this point')
  await expect(page.locator(POPUP)).not.toContainText('Test Harbor')
})

test('a station inside an alert opens one popup, the station\'s', async ({ page }) => {
  // The alert polygon covers the map centre, where the mocked station is, so one tap meant two things.
  await mockAlerts(page, mappableAlertsFixture())
  await mockCoops(page)
  await mockPointLookup(page)
  const centre = await openGlobe(page, { zoomIn: true })
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coops-stations', '1')

  await page.touchscreen.tap(centre.x + 8, centre.y + 6)
  await expect(page.locator(POPUP)).toContainText('Test Harbor, KS')
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1)
  await expect(page.locator(POPUP)).not.toContainText('Flood Warning')
})

test('the coverage is in the popup at once, under a forecast that is still loading', async ({ page }) => {
  await mockPointLookup(page)
  // The forecast service answers slowly.
  await page.route('**/points/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.fallback()
  })
  const centre = await openGlobe(page)

  await page.touchscreen.tap(centre.x + 60, centre.y)
  const popup = page.locator(POPUP)
  await expect(popup).toContainText('Loading forecast')
  await expect(popup).toContainText('APIs covering this point')
  await expect(popup).toContainText('Sunny')
})

test('the popup is capped, scrolls by touch, and closes from a finger-sized button', async ({ page }) => {
  await mockPointLookup(page)
  const centre = await openGlobe(page)

  await page.touchscreen.tap(centre.x + 60, centre.y)
  const popup = page.locator(POPUP)
  await expect(popup).toContainText('Sunny')
  // Thirty services cover a point in the US: most fold into one line, and opening it must not run
  // the popup off the globe.
  await popup.locator('summary').tap()
  await expect(popup.locator('.coverage-more li').first()).toBeVisible()
  const globeHeight = centre.box.height
  expect((await popup.boundingBox())!.height).toBeLessThanOrEqual(globeHeight * 0.5 + 1)
  expect(await popup.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(40)

  const box = (await popup.boundingBox())!
  const top = await popup.evaluate((el) => el.scrollTop)
  await swipe(page, { x: box.x + box.width / 2, y: box.y + box.height - 30 }, { x: box.x + box.width / 2, y: box.y + 30 })
  expect(await popup.evaluate((el) => el.scrollTop)).toBeGreaterThan(top + 30)

  const close = page.locator('.maplibregl-popup-close-button')
  const closeBox = (await close.boundingBox())!
  expect(closeBox.width).toBeGreaterThanOrEqual(44)
  expect(closeBox.height).toBeGreaterThanOrEqual(44)
  await close.tap()
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0)
})

test('a tap on the globe keeps the selected service\'s buoys on screen', async ({ page }) => {
  await mockNdbcStations(page)
  await mockPointLookup(page)
  await page.goto('/')
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
  await page.locator('.graph-node[data-node-id="ndbc-realtime"]').focus()
  await page.keyboard.press('Enter')

  await page.getByRole('tab', { name: /Globe/ }).tap()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-ndbc-stations', '1', { timeout: 20_000 })
  const box = (await page.locator(GLOBE).boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60)
  await expect(page.locator(POPUP)).toContainText('APIs covering this point')
  // The tap selected a point, which used to hide the layer the reader was looking at.
  await expect(page.locator(GLOBE)).toHaveAttribute('data-ndbc-stations', '1')

  // Choosing something else does take it away.
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: /Globe/ }).tap()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-ndbc-stations', '0')
})

test('what only informs takes no touches, so a pan that starts under it reaches the globe', async ({ page }) => {
  await openGlobe(page)
  await page.getByRole('tab', { name: /Tasks/ }).tap()
  await page.locator('.finder-task-item').first().tap()
  await page.getByRole('tab', { name: /Globe/ }).tap()
  const card = page.getByRole('status', { name: 'Selection status' })
  await expect(card).toBeVisible()
  expect(await card.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
  expect(await page.getByRole('status', { name: 'Geomagnetic activity' }).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
})

test('the credit button keeps its size under a coarse pointer, and its reach is wider than it looks', async ({ page }) => {
  await openGlobe(page)
  const button = page.locator('.maplibregl-ctrl-attrib-button')
  const box = (await button.boundingBox())!
  expect(box.height).toBeLessThanOrEqual(28)
  // 8px outside the visible circle is still the button.
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? '', { x: box.x + box.width + 8, y: box.y + box.height / 2 })
  expect(hit).toContain('maplibregl-ctrl-attrib-button')
})

test.describe('the locate button, with location allowed', () => {
  test.use({ geolocation: { latitude: 39.05, longitude: -95.68 }, permissions: ['geolocation'] })

  test('is labelled, waits visibly for a slow fix, then looks up the point', async ({ page }) => {
    await mockPointLookup(page)
    // A slow fix, and a record of what was asked for.
    await page.addInitScript(() => {
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation)
      const asked: PositionOptions[] = []
      ;(window as unknown as { askedFor: PositionOptions[] }).askedFor = asked
      navigator.geolocation.getCurrentPosition = (ok, fail, options) => {
        asked.push({ ...options })
        setTimeout(() => original(ok, fail, options), 1200)
      }
    })
    await openGlobe(page)

    const locate = page.getByRole('button', { name: 'Find my location' })
    await expect(locate).toBeEnabled()
    const box = (await locate.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await expect(locate).toContainText('My location')

    await locate.tap()
    await expect(locate).toBeDisabled()
    await expect(locate).toHaveAttribute('aria-busy', 'true')
    await expect(locate).toContainText('Locating')
    await expect(page.locator(POPUP)).toContainText('Sunny')
    await expect(locate).toBeEnabled()
    await expect(locate).toHaveAttribute('aria-busy', 'false')

    // A quick fix is enough for a forecast on a 2.5 km grid, and one from the last five minutes will do.
    const asked = await page.evaluate(() => (window as unknown as { askedFor: PositionOptions[] }).askedFor)
    expect(asked[0]).toMatchObject({ enableHighAccuracy: false, maximumAge: 300_000 })
  })
})

test.describe('the locate button, with location refused', () => {
  test('says what to do, and can be tried again', async ({ page }) => {
    await openGlobe(page)
    const locate = page.getByRole('button', { name: 'Find my location' })
    await expect(locate).toBeEnabled()
    await locate.tap()
    const status = page.getByLabel('Location status')
    await expect(status).toContainText('Location access is blocked')
    await expect(status).toContainText('tap the map')
    // MapLibre's own button stays disabled after a refusal; ours does not.
    await expect(locate).toBeEnabled()
    const dismiss = status.getByRole('button', { name: 'Dismiss' })
    expect((await dismiss.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await dismiss.tap()
    await expect(status).toHaveCount(0)
  })
})
