// A phone held on its side, 844x390 (#78): no header, footer or bar of tabs taking a quarter of the
// height. The tabs are a rail down the left with About at its foot, and the node detail is a panel
// down the right that the graph frames the selection beside.

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

// Reduced motion lays the graph out in one go instead of animating the ~6.5 s settle, and these
// specs assert the settled layout, not the animation.
test.use({ reducedMotion: 'reduce' })

test.use({ viewport: { width: 844, height: 390 } })

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
})

async function openGraph(page: Page) {
  await page.goto('/')
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

test('the tabs are a rail down the left, and the views take the whole height', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.app')).toHaveAttribute('data-layout', 'compact')

  const tabs = await page.getByRole('tab').all()
  const boxes = await Promise.all(tabs.map((tab) => tab.boundingBox()))
  const first = boxes[0]!
  for (const box of boxes) {
    expect(box!.x).toBe(first.x)
    expect(box!.width).toBeLessThanOrEqual(80)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  expect(boxes[1]!.y).toBeGreaterThan(first.y)

  const panel = (await page.getByRole('tabpanel').boundingBox())!
  expect(panel.x).toBeGreaterThanOrEqual(first.x + first.width - 1)
  expect(panel.height).toBeGreaterThanOrEqual(388)

  // The header and the footer are gone from the screen, but the title is still there for a screen reader.
  await expect(page.getByRole('contentinfo')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'NOAA Atlas' })).toBeAttached()
  expect((await page.locator('.app-header').boundingBox())!.height).toBeLessThanOrEqual(2)
})

test('About is at the foot of the rail, with the full disclaimer', async ({ page }) => {
  await page.goto('/')
  const about = page.getByRole('button', { name: 'About this app' })
  expect((await about.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await about.tap()
  const dialog = page.getByRole('dialog', { name: 'About NOAA Atlas' })
  await expect(dialog).toContainText('Not an official NOAA product')
  await expect(dialog).toContainText('Not for emergency or life-safety')
  await dialog.getByRole('button', { name: 'Close' }).tap()
  await expect(dialog).toBeHidden()
})

test('the graph has the room of the whole screen, not a sliver', async ({ page }) => {
  await openGraph(page)
  const canvas = (await page.locator('.graph-canvas').boundingBox())!
  expect(canvas.height).toBeGreaterThan(250)
  expect(canvas.width).toBeGreaterThan(700)
})

test('a selected node opens a panel down the right, and the graph frames it beside it', async ({ page }) => {
  await openGraph(page)
  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')

  const sheet = page.getByLabel('Node detail')
  await expect(sheet).toBeVisible()
  const box = (await sheet.boundingBox())!
  const panel = (await page.getByRole('tabpanel').boundingBox())!
  expect(box.x + box.width).toBeCloseTo(panel.x + panel.width, 0)
  expect(box.width).toBeLessThanOrEqual(361)
  expect(box.height).toBeGreaterThanOrEqual(panel.height - 1)
  // Always open: the detail is readable at once, and there is no grabber to fold it.
  await expect(sheet.getByText('Base URL')).toBeVisible()
  await expect(sheet.getByRole('button', { name: /Expand details|Collapse details/ })).toHaveCount(0)

  const node = (await page.locator('.graph-node[data-node-id="nws-api"] circle').boundingBox())!
  await expect.poll(async () => {
    const dot = await page.locator('.graph-node[data-node-id="nws-api"] circle').boundingBox()
    return dot ? dot.x + dot.width : Infinity
  }).toBeLessThan(box.x)
  expect(node.x).toBeGreaterThanOrEqual(panel.x)

  await sheet.getByRole('button', { name: 'Close details' }).tap()
  await expect(sheet).toHaveCount(0)
})

test('the globe card shrinks to its title, and the overlays leave most of the globe', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Tasks' }).tap()
  await page.locator('.finder-task-item').first().tap()
  await page.getByRole('tab', { name: /Globe/ }).tap()
  const card = page.getByRole('status', { name: 'Selection status' })
  await expect(card).toBeVisible()
  expect((await card.boundingBox())!.height).toBeLessThan(60)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
})

test('landscape has no serious violations on the Graph (with the panel open) and the Globe', async ({ page }) => {
  await openGraph(page)
  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Node detail')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])

  await page.getByRole('tab', { name: /Globe/ }).tap()
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})
