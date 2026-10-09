// AC3: linked selection, both directions (#43/#44/#45 → #46). Alerts are mocked empty for
// determinism/speed in both tests.

import { expect, test } from '@playwright/test'
import graphJson from '../src/data/graph.json' with { type: 'json' }
import { nodesCoveringPoint } from '../src/data/coverageLookup'
import { parseGraphFile } from '../src/data/graphSchema'
import { US_CENTER } from '../src/components/globe/globeConfig'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const graphNodes = parseGraphFile(graphJson).nodes

test('graph -> globe: selecting a node updates the globe status overlay', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')

  const node = page.locator('.graph-node[data-node-id="nws-api"]')
  await expect(node).toBeVisible()
  await node.focus()
  await page.keyboard.press('Enter')

  await expect(node).toHaveClass(/graph-node-highlighted/)

  const status = page.locator('[aria-label="Selection status"]')
  await expect(status).toBeVisible()
  await expect(status).toContainText('NWS API')
  await expect(status).toContainText('Coverage outlined on the globe.')
  await expect(status).toContainText('Its live layer, active alerts, is highlighted.')
  // The selection's coverage is drawn on the globe (#149).
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coverage-features', '1')
})

test('graph -> globe: a theme hub draws the coverage of all its services (#149)', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')

  const hub = page.locator('.graph-node[data-node-id="theme-ocean"]')
  await expect(hub).toBeVisible()
  await hub.focus()
  await page.keyboard.press('Enter')

  const ocean = graphNodes.filter((n) => n.theme === 'ocean')
  await expect(page.locator(GLOBE)).toHaveAttribute('data-coverage-features', String(ocean.length))
  await expect(page.locator('[aria-label="Selection status"]')).toContainText(`Coverage of its ${ocean.length} services`)
})

test('globe -> graph: clicking a point highlights the covering node(s) in the graph', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockPointLookup(page)
  const alertsResponsePromise = page.waitForResponse((res) => res.url().includes('/alerts/active'))
  await page.goto('/')

  const globe = page.locator(GLOBE)
  await expect(globe).toBeVisible()
  // The point-click handler is only registered inside the map's 'load' callback (same one that
  // triggers the alerts fetch), so waiting on that response confirms 'load' has fired and the
  // click handler is wired up before clicking.
  await alertsResponsePromise
  // No alerts layer exists (mocked empty), so this click always falls through to the plain
  // point-click handler, which calls selectPoint() synchronously before the (mocked) forecast
  // chain resolves.
  await globe.click()

  const expectedIds = nodesCoveringPoint(graphNodes, US_CENTER).map((n) => n.id)
  expect(expectedIds.length).toBeGreaterThan(0)

  const highlighted = page.locator('.graph-node-highlighted')
  await expect(highlighted).toHaveCount(expectedIds.length)
  for (const id of expectedIds) {
    await expect(page.locator(`.graph-node[data-node-id="${id}"]`)).toHaveClass(/graph-node-highlighted/)
  }
  await expect(page.locator('[aria-label="Selection status"]')).toContainText(
    `${expectedIds.length} APIs cover this spot, highlighted in the graph.`,
  )
})

test('clicking the space around the globe clears the selection instead of picking the nearest edge', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockPointLookup(page)
  const alertsResponsePromise = page.waitForResponse((res) => res.url().includes('/alerts/active'))
  await page.goto('/')
  const globe = page.locator(GLOBE)
  await alertsResponsePromise

  await globe.click()
  const highlighted = page.locator('.graph-node-highlighted')
  await expect(highlighted).not.toHaveCount(0)
  await expect(page.locator('.maplibregl-popup')).toHaveCount(1)

  // Zoomed out, the globe is a small disc and the canvas corners are empty space.
  const box = (await globe.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 400)
  // Retried until the zoom settles; clicks are spaced past the handler's double-click window.
  await expect(async () => {
    await page.mouse.click(box.x + 15, box.y + 15)
    await expect(highlighted).toHaveCount(0, { timeout: 500 })
  }).toPass({ intervals: [500] })
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0)
  await expect(page).not.toHaveURL(/point=/)
})

test('a coverage that crosses the antimeridian reads as the smaller arc (#80)', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await page.locator('.graph-node[data-node-id="goes-aws-open-data"]').focus()
  await page.keyboard.press('Enter')
  const coverage = page.getByText('Coverage', { exact: true }).locator('xpath=following-sibling::dd')
  await expect(coverage).toBeVisible()
  await expect(coverage).not.toContainText('180°W–180°E')
  await expect(coverage).toContainText(/^~\d+°E–\d+°W/)
})
