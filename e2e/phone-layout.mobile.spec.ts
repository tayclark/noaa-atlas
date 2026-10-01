// Phone layout (#78, #159), run as a Pixel 7 (touch, a coarse pointer, 412x915): no side-by-side
// split. The views are bottom tabs at full size: Tasks, Graph, Globe, Compare and Inspector. The
// ones that hold state load on first visit and then stay, the globe's bottom overlays stack instead
// of overlapping, and the attribution starts folded to its ⓘ button.

import { expect, test, type Locator } from '@playwright/test'
import { mockAlerts, zoneOnlyAlertsFixture } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

const overlaps = async (a: Locator, b: Locator) => {
  const [x, y] = [await a.boundingBox(), await b.boundingBox()]
  if (!x || !y) throw new Error('expected both overlays to be laid out')
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height
}

test('the emulation is a touch phone: a coarse pointer and the compact layout', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  await expect(page.locator('.app')).toHaveAttribute('data-layout', 'compact')
})

test('the views are five bottom tabs, each at full size and with no split', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(3))
  await mockSwpc(page)
  await page.goto('/')

  await expect(page.getByRole('tab')).toHaveText(['Tasks', 'Graph', 'Globe', 'Compare', /Inspector/])
  await expect(page.locator('.split-pane-divider')).toHaveCount(0)

  // The bar sits below the content, in the thumb zone, and every tab is a finger-sized target.
  const [bar, panel] = [await page.getByRole('tablist').boundingBox(), await page.getByRole('tabpanel').boundingBox()]
  if (!bar || !panel) throw new Error('expected the tab bar and the panel to be laid out')
  expect(bar.y).toBeGreaterThanOrEqual(panel.y + panel.height - 1)
  for (const tab of await page.getByRole('tab').all()) {
    const box = await tab.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
  }

  // The finder gets the whole panel rather than a share of it.
  expect((await page.locator('.left-panel-explore-finder').boundingBox())?.height ?? 0).toBeGreaterThan(500)
})

test('the globe is a full-width tab that loads on first visit, with its overlays clear of each other', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(3))
  await mockSwpc(page)
  await page.goto('/')

  // Nothing of the map is fetched or built until the tab is opened.
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0)

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

test('a selection made on Tasks marks the Graph and Globe tabs, which then show it', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(1))
  await mockSwpc(page)
  await page.goto('/')

  const graphTab = page.getByRole('tab', { name: /Graph/ })
  const globeTab = page.getByRole('tab', { name: /Globe/ })
  await expect(page.getByLabel('updated')).toHaveCount(0)
  const task = await page.locator('.finder-task-item').first().innerText()
  await page.locator('.finder-task-item').first().tap()
  await expect(graphTab.getByLabel('updated')).toHaveCount(1)
  await expect(globeTab.getByLabel('updated')).toHaveCount(1)

  await globeTab.tap()
  await expect(globeTab.getByLabel('updated')).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'Selection status' })).toContainText(task)

  await graphTab.tap()
  await expect(graphTab.getByLabel('updated')).toHaveCount(0)
  await expect(page.locator('.graph-node-highlighted').first()).toBeAttached()
})

test('the graph keeps its layout and the finder its task while another tab shows', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(1))
  await mockSwpc(page)
  await page.goto('/')

  const task = await page.locator('.finder-task-item').first().innerText()
  await page.locator('.finder-task-item').first().tap()
  const picked = page.getByRole('heading', { name: task })
  await expect(picked).toBeVisible()

  await page.getByRole('tab', { name: /Graph/ }).tap()
  const svg = page.locator('.graph-canvas svg')
  await expect(svg).toHaveAttribute('data-layout-settled', 'true', { timeout: 20_000 })
  const layer = page.locator('.graph-canvas svg > g').first()
  const framing = await layer.getAttribute('transform')

  await page.getByRole('tab', { name: 'Compare' }).tap()
  await expect(page.locator('.graph-canvas')).toBeHidden()
  await page.getByRole('tab', { name: /Graph/ }).tap()
  // The same settled layout and framing, not a new simulation.
  await expect(svg).toHaveAttribute('data-layout-settled', 'true')
  expect(await layer.getAttribute('transform')).toEqual(framing)

  await page.getByRole('tab', { name: 'Tasks' }).tap()
  await expect(picked).toBeVisible()
})

test('the footer is a single tappable line, with the full disclaimer behind About', async ({ page }) => {
  await page.goto('/')
  const footer = page.getByRole('contentinfo')
  expect((await footer.boundingBox())?.height ?? 0).toBeLessThanOrEqual(48)
  await expect(footer).toContainText('Not for emergencies')

  const dialog = page.getByRole('dialog', { name: 'About NOAA Atlas' })
  await expect(dialog).toBeHidden()
  await footer.getByRole('button', { name: 'About' }).tap()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Not an official NOAA product')
  await expect(dialog.getByRole('link', { name: 'Data terms' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).tap()
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: 'About this data' }).tap()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test.describe('a phone on its side', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('keeps the phone layout instead of a split with a sliver of graph', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app')).toHaveAttribute('data-layout', 'compact')
    await expect(page.getByRole('tab')).toHaveText(['Tasks', 'Graph', 'Globe', 'Compare', /Inspector/])
    await expect(page.locator('.split-pane-divider')).toHaveCount(0)
  })
})
