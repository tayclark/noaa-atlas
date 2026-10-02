// Keyboard paths (#267): Enter on the focused map looks up the spot under its centre marker, and
// Escape closes a popup, then clears the selection, from the globe, the graph or the detail card.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockPointLookup(page)
})

test('Enter on the focused map looks up its centre, and Escape closes the popup then the selection', async ({ page }) => {
  await page.goto('/')
  await page.locator(`${GLOBE}[data-coops-stations]`).waitFor({ state: 'attached' })
  const canvas = page.locator('.maplibregl-canvas')
  await canvas.focus()
  await expect(page.locator('.globe-centre')).toBeVisible()
  await expect(canvas).toHaveAttribute('aria-keyshortcuts', 'Enter')

  const pointRequest = page.waitForRequest((req) => req.url().includes('/points/'))
  await page.keyboard.press('Enter')
  await pointRequest
  const popup = page.locator('.maplibregl-popup')
  await expect(popup).toContainText('Sunny')
  await expect(page.getByLabel('Selection status')).toContainText('Selected point')

  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
  // MapLibre moved focus into the popup; closing it hands focus back to the map.
  await expect(canvas).toBeFocused()
  await expect(page.getByLabel('Selection status')).toContainText('Selected point')
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Selection status')).toHaveCount(0)

  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await expect(page.locator('.globe-centre')).toHaveCount(0)
})

test('Escape on a graph node closes its detail card', async ({ page }) => {
  await page.goto('/')
  const node = page.locator('.graph-node[data-node-id="nws-api"]')
  await node.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Node detail')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Node detail')).toHaveCount(0)
  await expect(node).not.toHaveClass(/graph-node-highlighted/)
})

test('Escape in the graph search clears the query and keeps the selection', async ({ page }) => {
  await page.goto('/#node=nws-api')
  await expect(page.getByLabel('Node detail')).toBeVisible()
  const search = page.getByRole('searchbox')
  await search.fill('tides')
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(page.getByLabel('Node detail')).toBeVisible()
})
