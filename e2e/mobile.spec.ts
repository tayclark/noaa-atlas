// Phone width (#78, #159): no side-by-side split. The globe is a tab of its own at full width, its
// bottom overlays stack instead of overlapping, and the attribution starts folded to its ⓘ button.

import { expect, test, type Locator } from '@playwright/test'
import { mockAlerts, zoneOnlyAlertsFixture } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

test.use({ viewport: { width: 390, height: 844 } })

const overlaps = async (a: Locator, b: Locator) => {
  const [x, y] = [await a.boundingBox(), await b.boundingBox()]
  if (!x || !y) throw new Error('expected both overlays to be laid out')
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height
}

test('the globe is a full-width tab, with its overlays clear of each other', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(3))
  await mockSwpc(page)
  await page.goto('/')

  await expect(page.getByRole('tab')).toHaveText(['Explore', 'Globe', /Inspector/])
  // Only the finder/graph divider inside Explore; the panel and the globe aren't split.
  await expect(page.locator('.split-pane-divider')).toHaveCount(1)

  await page.getByRole('tab', { name: 'Globe' }).click()
  const canvas = page.locator('.maplibregl-canvas')
  await expect(canvas).toBeVisible()
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(380)

  const kp = page.getByRole('status', { name: 'Geomagnetic activity' })
  const alerts = page.getByLabel('Alerts without a mapped area')
  await expect(kp).toBeVisible()
  await expect(alerts).toBeVisible()
  expect(await overlaps(kp, alerts)).toBe(false)
  await expect(page.locator('.maplibregl-ctrl-attrib')).not.toHaveClass(/maplibregl-compact-show/)
})

test('a selection made in Explore marks the Globe tab, which then shows it', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(1))
  await mockSwpc(page)
  await page.goto('/')

  const globeTab = page.getByRole('tab', { name: /Globe/ })
  await expect(globeTab.getByLabel('updated')).toHaveCount(0)
  await page.locator('.finder-task-item').first().click()
  await expect(globeTab.getByLabel('updated')).toHaveCount(1)

  const task = await page.locator('.finder-task-item').first().innerText()
  await globeTab.click()
  await expect(globeTab.getByLabel('updated')).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'Selection status' })).toContainText(task)
})
