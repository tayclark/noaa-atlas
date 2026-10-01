// The phone's node detail (#78): a bottom sheet over the Tasks and Graph views. It peeks so a
// selection doesn't cover the view, opens to read the rest, drags by its header, and is dismissed
// with its close button, Escape, or a pull down from peek.

import { expect, test, type Locator, type Page } from '@playwright/test'
import { mockAlerts, zoneOnlyAlertsFixture } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'
import { centreOf, swipe } from './fixtures/touch'

// Reduced motion lays the graph out in one go instead of animating the ~6.5 s settle, and these
// specs assert the settled layout, not the animation.
test.use({ reducedMotion: 'reduce' })

async function openGraph(page: Page) {
  await mockAlerts(page, zoneOnlyAlertsFixture(1))
  await mockSwpc(page)
  await page.goto('/')
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
}

// Node selection is by keyboard (CLAUDE.md): the graph re-frames after every selection.
async function selectOnGraph(page: Page, id: string) {
  await page.locator(`.graph-node[data-node-id="${id}"]`).focus()
  await page.keyboard.press('Enter')
}

const sheet = (page: Page) => page.getByLabel('Node detail')
const height = async (locator: Locator) => (await locator.boundingBox())?.height ?? 0
// Folded, the body is clipped away but still laid out, so "hidden" is its `inert` attribute: the
// clipped part can't be reached by keyboard or screen reader.
const body = (page: Page) => page.locator('.detail-sheet-body')
const expectFolded = (page: Page) => expect(body(page)).toHaveAttribute('inert', '')
const expectOpen = async (page: Page) => {
  await expect(body(page)).not.toHaveAttribute('inert', /.*/)
  await expect(sheet(page).getByText('Base URL')).toBeVisible()
}

test('a node picked on the graph peeks, and opens from its grabber', async ({ page }) => {
  await openGraph(page)
  await selectOnGraph(page, 'nws-api')

  const panels = page.locator('.left-panel-panels')
  await expect(sheet(page)).toBeVisible()
  // A header, not a share of the screen: well under a quarter of the view.
  await expect.poll(() => height(sheet(page))).toBeLessThan((await height(panels)) * 0.25)
  await expect(sheet(page).getByRole('button', { name: 'Compare' })).toBeVisible()
  await expectFolded(page)

  await sheet(page).getByRole('button', { name: 'Expand details' }).tap()
  await expectOpen(page)
  await expect.poll(async () => (await height(panels)) - (await height(sheet(page)))).toBeLessThan(80)

  await sheet(page).getByRole('button', { name: 'Collapse details' }).tap()
  await expectFolded(page)
})

test('the selection is framed in the part of the graph the sheet leaves free', async ({ page }) => {
  await openGraph(page)
  await selectOnGraph(page, 'nws-api')
  await expect(sheet(page)).toBeVisible()

  const sheetTop = (await sheet(page).boundingBox())!.y
  const node = page.locator('.graph-node[data-node-id="nws-api"] circle')
  await expect.poll(async () => {
    const box = await node.boundingBox()
    return box ? box.y + box.height : Infinity
  }).toBeLessThan(sheetTop)
  const canvas = (await page.locator('.graph-canvas').boundingBox())!
  const box = (await node.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(canvas.y)
})

test('a drag on the header opens it, and a pull down folds it, then dismisses it', async ({ page }) => {
  await openGraph(page)
  await selectOnGraph(page, 'nws-api')
  const panels = page.locator('.left-panel-panels')
  await expect(sheet(page)).toBeVisible()
  const peek = await height(sheet(page))

  const grip = await centreOf(page, '.detail-sheet-title h3')
  await swipe(page, grip, { x: grip.x, y: grip.y - 400 })
  await expectOpen(page)
  expect(await height(sheet(page))).toBeGreaterThan(peek + 200)
  expect(await height(sheet(page))).toBeLessThanOrEqual((await height(panels)) + 1)

  const down = await centreOf(page, '.detail-sheet-title h3')
  await swipe(page, down, { x: down.x, y: down.y + 500 })
  await expectFolded(page)
  await expect(sheet(page)).toBeVisible()

  const header = await centreOf(page, '.detail-sheet-title h3')
  await swipe(page, header, { x: header.x, y: header.y + 120 })
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.locator('.graph-node[aria-pressed="true"]')).toHaveCount(0)
})

test('the close button and Escape dismiss it, clearing the selection', async ({ page }) => {
  await openGraph(page)
  await selectOnGraph(page, 'nws-api')
  await sheet(page).getByRole('button', { name: 'Close details' }).tap()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.locator('.graph-node[aria-pressed="true"]')).toHaveCount(0)

  await selectOnGraph(page, 'nws-api')
  await expect(sheet(page)).toBeVisible()
  await sheet(page).getByRole('button', { name: 'Compare' }).focus()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
})

test('Compare toggles from the header, and Show on globe switches tabs', async ({ page }) => {
  await openGraph(page)
  await selectOnGraph(page, 'nws-api')
  const compare = sheet(page).getByRole('button', { name: 'Compare' })
  await compare.tap()
  await expect(compare).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('tab', { name: /Compare/ }).getByLabel('1 selected')).toBeVisible()

  await sheet(page).getByRole('button', { name: 'Show on globe' }).tap()
  await expect(page.getByRole('tab', { name: /Globe/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  // The globe has its own card; the sheet belongs to Tasks and Graph.
  await expect(sheet(page)).toHaveCount(0)
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await expect(sheet(page)).toBeVisible()
})

test('a step picked on the Tasks tab opens the detail, and Back returns to the list', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(1))
  await mockSwpc(page)
  await page.goto('/')

  const task = await page.locator('.finder-task-item').first().innerText()
  await page.locator('.finder-task-item').first().tap()
  await expect(page.getByRole('heading', { name: task })).toBeVisible()
  await expect(page.locator('.finder-task-item')).toHaveCount(0)

  await page.locator('.finder-node-button').first().tap()
  await expect(sheet(page)).toBeVisible()
  await expectOpen(page)

  // Switching to the graph folds it to a peek, so the graph is not buried.
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await expectFolded(page)

  await page.getByRole('tab', { name: 'Tasks' }).tap()
  await page.getByRole('button', { name: /Tasks/ }).filter({ hasText: '‹' }).tap()
  await expect(sheet(page)).toHaveCount(0)
  expect(await page.locator('.finder-task-item').count()).toBeGreaterThan(5)
})

test('Show on graph from a task page frames the whole path', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(1))
  await mockSwpc(page)
  await page.goto('/')
  await page.locator('.finder-task-item').nth(1).tap()
  await page.locator('.finder-node-button').first().tap()
  // The step opened the detail over the page; fold it to reach the page's own buttons.
  await sheet(page).getByRole('button', { name: 'Collapse details' }).tap()
  await page.getByRole('button', { name: 'Show on graph' }).tap()
  await expect(page.getByRole('tab', { name: /Graph/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.graph-node-highlighted').first()).toBeAttached()
  // The whole task is selected again, not the one step, so there is no node detail to cover it.
  await expect(sheet(page)).toHaveCount(0)
})
