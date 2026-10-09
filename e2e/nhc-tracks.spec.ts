// NHC storm tracks (#334): fetched and drawn only while the NHC node is selected, with a play control
// that runs the chosen storm from its first fix through its forecast, storm chips, and an Inspector
// entry per layer query. Plus one `@live` check against the real MapServer.

import { expect, test, type Page } from '@playwright/test'
import { emptyNhcStormData } from '../src/data/nhcFixtures'
import { GLOBE, waitForGlobe } from './fixtures/globe'
import { mockNhcStorms, NHC_URL } from './fixtures/nhc'
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
    await expect(label).toHaveText('Fri 9 Oct, 15:00 UTC · latest advisory · 105 kt, Cat 3')

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
