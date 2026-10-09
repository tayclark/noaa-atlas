// NHC storm tracks (#334): the NHC node draws them like any live layer, and a looked-up point in a
// storm's cone or under a tropical warning offers the full view (#344): a play control that runs the
// storm from its first fix through its forecast, satellite and simulated radar under it, storm chips,
// and an Inspector entry per layer query. Plus one `@live` check against the real MapServer.

import { expect, test, type Page } from '@playwright/test'
import { emptyNhcStormData } from '../src/data/nhcFixtures'
import { GLOBE, waitForGlobe } from './fixtures/globe'
import { mockGfs } from './fixtures/gfs'
import { GOES_FRAMES, mockGoesSatellite, mockNhcStorms, NHC_URL } from './fixtures/nhc'
import { emptyAlertsFixture, mappableAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const NODE = 'nhc-active-storms'
// Inside the fixture's Isaias cone, on the Gulf coast.
const IN_CONE = '-87,30'

/** Looks up a place in Isaias's cone and accepts the prompt, which opens the full storm view. */
async function openStormView(page: Page) {
  await page.goto(`/#point=${IN_CONE}`)
  await waitForGlobe(page)
  const prompt = page.getByRole('region', { name: 'Storm may affect this location' })
  await prompt.getByRole('button', { name: 'Show storm track' }).click()
  await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-view', 'full')
}

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

  test('the node alone draws the tracks like any live layer: no player, imagery or storm framing', async ({ page }) => {
    let requests = 0
    await mockNhcStorms(page)
    await page.route(NHC_URL, (route) => {
      requests += 1
      return route.fallback()
    })
    const goes = await mockGoesSatellite(page)
    const gfs = await mockGfs(page)
    await page.goto('/')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', 'hidden')
    expect(requests).toBe(0)

    await selectByKeyboard(page, NODE)
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', 'ok')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-view', 'static')
    expect(requests).toBe(3)
    await expect(page.getByRole('status', { name: 'Storm track legend' })).toContainText('Cat 3')
    await expect(page.getByRole('group', { name: 'Storm track time' })).toHaveCount(0)
    await expect(page.locator(GLOBE)).toHaveAttribute('data-alerts-emphasis', 'normal')
    expect(goes).toHaveLength(0)
    expect(gfs).toHaveLength(0)

    await selectByKeyboard(page, 'nws-api')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-tracks', 'hidden')
  })

  test('a place in a storm cone is offered the full view, which can be put off for that place', async ({ page }) => {
    await mockNhcStorms(page)
    await page.goto(`/#point=${IN_CONE}`)
    await waitForGlobe(page)
    const prompt = page.getByRole('region', { name: 'Storm may affect this location' })
    await expect(prompt).toContainText('Hurricane Isaias may affect this location')
    await expect(prompt).toContainText("inside the storm's 5-day forecast cone")
    await prompt.getByRole('button', { name: 'Not now' }).click()
    await expect(prompt).toHaveCount(0)

    await page.goto('/#point=-95.68,39.05')
    await page.reload()
    await waitForGlobe(page)
    await expect(page.getByLabel('Selection status')).toContainText('Selected point')
    await expect(page.getByRole('region', { name: 'Storm may affect this location' })).toHaveCount(0)
  })

  test('a place under a hurricane warning outside every cone is offered the nearest storm', async ({ page }) => {
    await mockNhcStorms(page)
    const alerts = mappableAlertsFixture()
    const [alert] = alerts.features
    const ring = [[-81, 25], [-79, 25], [-79, 27], [-81, 27], [-81, 25]] as const
    await mockAlerts(page, { ...alerts, features: [{ ...alert!, properties: { ...alert!.properties, event: 'Hurricane Warning' }, geometry: { type: 'Polygon', coordinates: [ring] } }] })
    await page.goto('/#point=-80,26')
    await waitForGlobe(page)
    const prompt = page.getByRole('region', { name: 'Storm may affect this location' })
    await expect(prompt).toContainText('Hurricane Isaias may affect this location')
    await expect(prompt).toContainText('A Hurricane Warning is in effect here.')
    await prompt.getByRole('button', { name: 'Show storm track' }).click()
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-view', 'full')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-storm', 'AT4')
  })

  test('play runs the storm from its first fix, a scrub pauses it, and a chip switches storms', async ({ page }) => {
    await mockNhcStorms(page)
    await openStormView(page)
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
    await openStormView(page)
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
    await openStormView(page)
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

  test('the alert polygons fade in the full view only, and come back for the alerts node', async ({ page }) => {
    await mockNhcStorms(page)
    await openStormView(page)
    await expect(page.locator(GLOBE)).toHaveAttribute('data-alerts-emphasis', 'dimmed')

    await selectByKeyboard(page, 'nws-api')
    await expect(page.locator(GLOBE)).toHaveAttribute('data-alerts-emphasis', 'highlighted')
    await selectByKeyboard(page, NODE)
    await expect(page.locator(GLOBE)).toHaveAttribute('data-nhc-view', 'static')
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
