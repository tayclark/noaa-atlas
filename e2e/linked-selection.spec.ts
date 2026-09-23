// AC3: linked selection, both directions (#43/#44/#45 → #46). Alerts are mocked empty for
// determinism/speed in both tests.

import { expect, test } from '@playwright/test'
import graphJson from '../src/data/graph.json' with { type: 'json' }
import { nodesCoveringPoint } from '../src/data/coverageLookup'
import { parseGraphFile } from '../src/data/graphSchema'
import { US_CENTER } from '../src/components/globe/globeConfig'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'
const graphNodes = parseGraphFile(graphJson).nodes

test('graph -> globe: selecting a node updates the globe status overlay', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')

  await page.getByRole('tab', { name: 'Graph' }).click()
  const node = page.locator('.graph-node[data-node-id="nws-api"]')
  await expect(node).toBeVisible()
  await node.click()

  await expect(node).toHaveClass(/graph-node-highlighted/)

  const status = page.locator('[aria-label="Selected node status"]')
  await expect(status).toBeVisible()
  await expect(status).toContainText('NWS API')
  await expect(status).toContainText('Live layer highlighted below.')
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

  await page.getByRole('tab', { name: 'Graph' }).click()
  const highlighted = page.locator('.graph-node-highlighted')
  await expect(highlighted).toHaveCount(expectedIds.length)
  for (const id of expectedIds) {
    await expect(page.locator(`.graph-node[data-node-id="${id}"]`)).toHaveClass(/graph-node-highlighted/)
  }
})
