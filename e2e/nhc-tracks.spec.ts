// NHC storm tracks (#334): fetched and drawn only while the NHC node is selected, with a play control
// that runs the chosen storm from its first fix through its forecast, storm chips, and an Inspector
// entry per layer query. Plus one `@live` check against the real MapServer.

import { expect, test, type Page } from '@playwright/test'
import { emptyNhcStormData } from '../src/data/nhcFixtures'
import { GLOBE, waitForGlobe } from './fixtures/globe'
import { mockGfs } from './fixtures/gfs'
import { GOES_FRAMES, mockGoesSatellite, mockNhcStorms, NHC_URL } from './fixtures/nhc'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const NODE = 'nhc-active-storms'

async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await mockPointLookup(page)
})

test.describe('mocked', () => {
  test.beforeEach(async ({ page }) => {
    await mockGoesSatellite(page)
    await mockGfs(page)
  })

  test('the tracks are requested and drawn only while the NHC node is selected', async ({ page }) => {
    let requests = 0
    await mockNhcStorms(page)
    await page.route(NHC_URL, (route) => {
      requests += 1
      return route.fallback()
    })
    await page.goto('/')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', 'hidden')
    expect(requests).toBe(0)

    await selectByKeyboard(page, NODE)
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', 'ok')
    expect(requests).toBe(3)
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-storm', 'AT4')
    await expect(page.getByRole('status', { name: 'Storm track legend' })).toContainText('Cat 3')

    await selectByKeyboard(page, 'nws-api')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', 'hidden')
    await expect(page.getByRole('group', { name: 'Storm track time' })).toHaveCount(0)
  })

  test('play runs the storm from its first fix, a scrub pauses it, and a chip switches storms', async ({ page }) => {
    await mockNhcStorms(page)
    await page.goto('/')
    await waitForGlobe(page)
    await selectByKeyboard(page, NODE)
    const control = page.getByRole('group', { name: 'Storm track time' })
    const slider = control.getByRole('slider', { name: 'Hurricane Isaias track time' })
    const label = control.locator('.radar-time-label')
    await expect(label).toHaveText('Fri 9 Oct, 15:00 UTC · latest advisory · 105 kt, Cat 3 · satellite latest, 14:30 UTC')

    await slider.fill('0')
    await expect(label).toContainText('Thu 8 Oct, 06:00 UTC · 33 h before advisory · 70 kt, Cat 1')
    await control.getByRole('button', { name: 'Play Hurricane Isaias track' }).click()
    await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(3)
    await control.getByRole('button', { name: 'Pause Hurricane Isaias track' }).click()

    await control.getByRole('button', { name: 'Next fix' }).click()
    await expect(control.getByRole('button', { name: 'Play Hurricane Isaias track' })).toBeVisible()

    await control.getByRole('button', { name: 'Tropical Storm Rachel' }).click()
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-storm', 'EP3')
    await expect(control.getByRole('slider', { name: 'Tropical Storm Rachel track time' })).toBeVisible()
    await expect(label).toContainText('latest advisory · 45 kt, TS')
  })

  test('satellite imagery under the track follows the slider inside its archive, and is the latest outside it', async ({ page }) => {
    await mockNhcStorms(page)
    const tiles = await mockGoesSatellite(page)
    await page.goto('/')
    await waitForGlobe(page)
    expect(tiles).toHaveLength(0)
    await selectByKeyboard(page, NODE)
    const control = page.getByRole('group', { name: 'Storm track time' })
    const label = control.locator('.radar-time-label')
    // The advisory (15:00) is after the newest frame (14:30), so the latest image is drawn.
    await expect(page.locator(GLOBE)).toHaveAttribute('data-goes-time', 'latest')
    await expect(label).toContainText('satellite latest, 14:30 UTC')
    await expect.poll(() => tiles.length).toBeGreaterThan(0)
    expect(tiles.every((url) => url.includes('layers=goes_longwave_imagery') && !url.includes('time='))).toBe(true)

    const slider = control.getByRole('slider', { name: 'Hurricane Isaias track time' })
    await slider.fill(String(Number(await slider.inputValue()) - 1))
    await expect(page.locator(GLOBE)).toHaveAttribute('data-goes-time', GOES_FRAMES[1] as string)
    await expect(label).toContainText('14:00 UTC · 1 h before advisory · 105 kt, Cat 3 · satellite 14:00 UTC')
    await expect.poll(() => tiles.some((url) => url.includes('time=2026-10-09T14%3A00%3A00.000Z'))).toBe(true)

    await selectByKeyboard(page, 'nws-api')
    await expect(page.locator(GLOBE)).not.toHaveAttribute('data-goes-time', /.*/)
  })

  test('past the advisory the satellite gives way to GFS simulated radar, and comes back before it', async ({ page }) => {
    await mockNhcStorms(page)
    const gfs = await mockGfs(page)
    await page.goto('/')
    await waitForGlobe(page)
    await selectByKeyboard(page, NODE)
    const control = page.getByRole('group', { name: 'Storm track time' })
    const slider = control.getByRole('slider', { name: 'Hurricane Isaias track time' })
    const label = control.locator('.radar-time-label')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-gfs-reflectivity', 'hidden')
    // The first forecast step is fetched ahead, while the slider still shows the advisory.
    await expect.poll(() => gfs.some((r) => r.url.includes('pgrb2.1p00') && r.range !== null)).toBe(true)

    const advisory = Number(await slider.inputValue())
    await slider.fill(String(advisory + 12))
    await expect(page.locator(GLOBE)).toHaveAttribute('data-gfs-reflectivity', 'ok')
    await expect(page.locator(GLOBE)).not.toHaveAttribute('data-goes-time', /.*/)
    await expect(label).toContainText(/forecast \+12 h · .* · GFS simulated radar, \d{2}Z run/)
    await expect(page.getByRole('status', { name: 'Storm track legend' })).toContainText('GFS simulated radar (dBZ)')

    await slider.fill(String(advisory - 1))
    await expect(page.locator(GLOBE)).toHaveAttribute('data-gfs-reflectivity', 'hidden')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-goes-time', GOES_FRAMES[1] as string)
    await expect(page.getByRole('status', { name: 'Storm track legend' })).not.toContainText('GFS simulated radar')
  })

  test('the alert polygons fade under the tracks, also on a deep link, and come back for the alerts node', async ({ page }) => {
    await mockNhcStorms(page)
    await page.goto(`/#node=${NODE}`)
    await waitForGlobe(page)
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', 'ok')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-alerts-emphasis', 'dimmed')

    await selectByKeyboard(page, 'nws-api')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-alerts-emphasis', 'highlighted')
    await selectByKeyboard(page, 'spc-gis-data')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-alerts-emphasis', 'normal')
  })

  test('the layer queries land in the Inspector', async ({ page }) => {
    await mockNhcStorms(page)
    await page.goto('/')
    await waitForGlobe(page)
    await selectByKeyboard(page, NODE)
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', 'ok')
    await page.getByRole('tab', { name: /Inspector/ }).click()
    await expect(page.getByRole('button', { name: /\/10\/query/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /\/5\/query/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /\/7\/query/ })).toBeVisible()
  })

  test('a quiet season and a failed fetch say so', async ({ page }) => {
    await mockNhcStorms(page, emptyNhcStormData())
    await page.goto('/')
    await waitForGlobe(page)
    await selectByKeyboard(page, NODE)
    await expect(page.getByRole('status', { name: 'Storm track status' })).toContainText('No active tropical cyclones')
    await expect(page.getByRole('group', { name: 'Storm track time' })).toHaveCount(0)

    await page.unroute(NHC_URL)
    await page.route(NHC_URL, (route) => route.fulfill({ status: 503, body: '' }))
    await page.reload()
    await waitForGlobe(page)
    await selectByKeyboard(page, NODE)
    await expect(page.getByRole('status', { name: 'Storm track status' })).toContainText('unavailable')
  })
})

// Off season there may be no storms, so either answer passes; what must not happen is an error (CORS, schema drift).
test('loads the real active storms @live', async ({ page }) => {
  await page.goto('/')
  await waitForGlobe(page)
  await selectByKeyboard(page, NODE)
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', /^(ok|empty)$/, { timeout: 30_000 })
})
