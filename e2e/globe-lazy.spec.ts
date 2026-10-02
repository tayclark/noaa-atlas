// The globe loads on demand (#264): the finder and graph render while its chunk (and MapLibre with
// it) is still on the way, a placeholder holds the pane, and a selection made in the meantime is
// shown once the globe arrives. The dev server serves the chunk as its source module, so holding
// that one request stands in for a slow network.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'

/** Holds the globe module's request until the returned function is called. */
async function holdGlobeChunk(page: Page) {
  let release = () => {}
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route(/\/src\/components\/globe\/MapLibreGlobe\.tsx/, async (route) => {
    await released
    await route.continue()
  })
  return release
}

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
})

test('the graph renders and takes a selection before the globe arrives, which then shows it', async ({ page }) => {
  const release = await holdGlobeChunk(page)
  const maplibre: string[] = []
  page.on('request', (req) => {
    if (/maplibre-gl/.test(req.url()) && !req.url().endsWith('.css')) maplibre.push(req.url())
  })
  await page.goto('/')

  const node = page.locator('.graph-node[data-node-id="nws-api"]')
  await expect(node).toBeVisible()
  await expect(page.getByRole('status', { name: 'Map status' })).toContainText('Loading the globe')
  expect(maplibre).toEqual([])

  await node.focus()
  await page.keyboard.press('Enter')
  await expect(node).toHaveClass(/graph-node-highlighted/)

  release()
  await expect(page.locator(GLOBE)).toBeVisible()
  await expect(page.getByRole('status', { name: 'Map status' })).toHaveCount(0)
  // The selection made while the globe was loading is outlined on it and named in its status.
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coverage-features', '1')
  await expect(page.locator('[aria-label="Selection status"]')).toContainText('NWS API')
})

test('a point link still opens its lookup when the globe arrives late', async ({ page }) => {
  const release = await holdGlobeChunk(page)
  await mockPointLookup(page)
  await page.goto('/#point=-95.68,39.05')
  await expect(page.locator('.graph-node').first()).toBeVisible()
  await expect(page.getByRole('status', { name: 'Map status' })).toContainText('Loading the globe')

  const pointRequest = page.waitForRequest((req) => req.url().includes('/points/'))
  release()
  expect((await pointRequest).url()).toContain('/points/39.05,-95.68')
  await expect(page.locator('.maplibregl-popup')).toContainText('Sunny')
})

test('a globe chunk that fails to load leaves a message in its pane and the rest working', async ({ page }) => {
  await page.route(/\/src\/components\/globe\/MapLibreGlobe\.tsx/, (route) => route.abort('internetdisconnected'))
  await page.goto('/')

  await expect(page.getByRole('status', { name: 'Map status' })).toContainText("The globe's code couldn't load")
  const node = page.locator('.graph-node[data-node-id="nws-api"]')
  await node.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Node detail').getByRole('heading', { name: 'NWS API' })).toBeVisible()
})
