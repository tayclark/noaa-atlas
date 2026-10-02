// Accessibility baseline (#47): axe finds no serious or critical WCAG A/AA violations, the skip
// link and tabs work from the keyboard, and "reduce motion" settles the graph without animating.

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mappableAlertsFixture, mockAlerts, zoneOnlyAlertsFixture } from './fixtures/nwsAlerts'
import { mockRadar } from './fixtures/nowcoast'
import { mockSwpc } from './fixtures/swpc'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

async function openApp(page: Page) {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

test('the initial view has no serious axe violations', async ({ page }) => {
  await openApp(page)
  expect(await seriousViolations(page)).toEqual([])
})

test('a selected node and its detail panel have no serious axe violations', async ({ page }) => {
  await openApp(page)
  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Node detail')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test('the skip link is the first Tab stop and moves focus to the main content', async ({ page }) => {
  await openApp(page)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

// The graph's nodes (#284) and the finder's tasks (#300) each share one Tab stop, so the map is a
// fixed walk from load however many services and tasks there are (it used to be a stop for each).
test('the map canvas is a fixed number of Tab presses from load, past one stop each for the tasks and the graph nodes', async ({ page }) => {
  await openApp(page)
  const map = page.locator('.maplibregl-canvas')
  await expect(map).toBeVisible()
  const stops: string[] = []
  while (stops.length < 80 && stops.at(-1) !== 'map') {
    await page.keyboard.press('Tab')
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement
        if (el?.classList.contains('maplibregl-canvas')) return 'map'
        if (el?.classList.contains('graph-node')) return 'node'
        if (el?.classList.contains('finder-task-item')) return 'task'
        return el?.getAttribute('aria-label') === 'Service graph' ? 'graph' : 'other'
      }),
    )
  }
  await expect(map).toBeFocused()
  // The graph canvas, one node, the pane divider, then the map.
  expect(stops.slice(stops.indexOf('graph'))).toEqual(['graph', 'node', 'other', 'map'])
  expect(stops.filter((stop) => stop === 'task')).toHaveLength(1)
  expect(stops.length).toBeLessThanOrEqual(20)
})

test('the arrow keys walk the finder tasks without picking one, and Enter picks one', async ({ page }) => {
  await openApp(page)
  const tasks = page.locator('.finder-task-item')
  await page.getByRole('tab', { name: 'Explore' }).focus()
  await page.keyboard.press('Tab')
  await expect(tasks.first()).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(tasks.nth(1)).toBeFocused()
  await expect(tasks.nth(1)).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('End')
  await expect(tasks.last()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(tasks.first()).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(tasks.last()).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(tasks.last()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('list', { name: 'Recommended nodes' })).toBeVisible()
  // Tab leaves the list from the picked task rather than walking the rest.
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('tab', { name: 'Explore' })).toBeFocused()
})

test('the arrow keys walk the graph nodes and Enter selects one', async ({ page }) => {
  await openApp(page)
  await page.getByRole('group', { name: 'Service graph' }).focus()
  await page.keyboard.press('Tab')
  const focusedId = () => page.evaluate(() => document.activeElement?.getAttribute('data-node-id') ?? null)
  expect(await focusedId()).toBe('noaa')

  await page.keyboard.press('ArrowRight')
  const second = await focusedId()
  expect(second).not.toBe('noaa')
  await page.keyboard.press('End')
  const last = await focusedId()
  expect(last).not.toBe(second)
  await page.keyboard.press('ArrowRight')
  expect(await focusedId()).toBe('noaa')
  await page.keyboard.press('ArrowLeft')
  expect(await focusedId()).toBe(last)

  await page.keyboard.press('Enter')
  const node = page.locator(`.graph-node[data-node-id="${last}"]`)
  await expect(node).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('selection-announcement')).toHaveText(/^Selected /)
  // The panned-to node is on screen, clear of the canvas edges.
  const canvas = await page.locator('.graph-canvas svg').boundingBox()
  const box = await node.locator('circle').boundingBox()
  expect(canvas && box).toBeTruthy()
  expect(box!.x).toBeGreaterThanOrEqual(canvas!.x)
  expect(box!.x + box!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width)

  // Tab leaves the graph from the selected node rather than walking the rest.
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('group', { name: 'Service graph' })).toBeFocused()
})

test('the tabs move with the arrow keys', async ({ page }) => {
  await openApp(page)
  await page.getByRole('tab', { name: 'Explore' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Compare' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true')
})

test('the Compare tab has no serious axe violations, empty or filled', async ({ page }) => {
  await openApp(page)
  await page.getByRole('tab', { name: 'Compare' }).click()
  expect(await seriousViolations(page)).toEqual([])
  await page.getByRole('tab', { name: 'Explore' }).click()
  await page.getByRole('button', { name: 'See severe thunderstorm or tornado risk' }).click()
  await page.getByRole('button', { name: 'Compare these' }).click()
  await page.getByRole('tab', { name: /Compare/ }).click()
  await expect(page.getByRole('columnheader')).toHaveCount(2)
  expect(await seriousViolations(page)).toEqual([])
})

test('with reduced motion the graph is laid out before the first frame settles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openApp(page)
  const positions = () =>
    page.locator('.graph-node').evaluateAll((els) => els.map((el) => el.getAttribute('transform')))
  const first = await positions()
  await page.waitForTimeout(500)
  expect(await positions()).toEqual(first)
})

test('the Inspector tab has no serious axe violations', async ({ page }) => {
  await openApp(page)
  await page.getByRole('tab', { name: 'Inspector' }).click()
  expect(await seriousViolations(page)).toEqual([])
})

test('the phone layout has no serious axe violations on the Tasks, Graph and Globe tabs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'Tasks', selected: true })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])

  await page.getByRole('tab', { name: 'Graph' }).click()
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
  expect(await seriousViolations(page)).toEqual([])

  await page.getByRole('tab', { name: 'Globe' }).click()
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test('a selection is announced and the focused graph pans and zooms from the keyboard', async ({ page }) => {
  await openApp(page)
  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('selection-announcement')).toHaveText(/^Selected /)

  const layer = page.locator('.graph-canvas svg > g').first()
  await page.getByRole('group', { name: 'Service graph' }).focus()
  const before = await layer.getAttribute('transform')
  await page.keyboard.press('ArrowRight')
  const panned = await layer.getAttribute('transform')
  expect(panned).not.toEqual(before)
  await page.keyboard.press('+')
  expect(await layer.getAttribute('transform')).not.toEqual(panned)
})


// This test clicks the globe's centre for a mapped alert and fails under reduced motion, so it keeps full motion.
test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('an open alert popup has no serious axe violations (#86)', async ({ page }) => {
    await mockAlerts(page, mappableAlertsFixture())
    await mockSwpc(page)
    await page.goto('/')
    await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
    const globe = page.locator('[aria-label="Globe view of NOAA API coverage"]')
    await expect(globe).toHaveAttribute('data-coops-stations', /\d+/, { timeout: 20_000 })
    await globe.click()
    await expect(page.getByText('Flood Warning')).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])
  })
})

test('the expanded zone-only alerts overlay has no serious axe violations (#86)', async ({ page }) => {
  await mockAlerts(page, zoneOnlyAlertsFixture(7))
  await mockSwpc(page)
  await page.goto('/')
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Expand zone alerts' }).click()
  await expect(page.getByLabel('Alerts without a mapped area').getByRole('listitem')).toHaveCount(5)
  expect(await seriousViolations(page)).toEqual([])
})

test('the radar time slider has no serious axe violations (#74)', async ({ page }) => {
  await mockRadar(page)
  await openApp(page)
  await page.locator('.graph-node[data-node-id="nowcoast-map-services"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('slider', { name: 'Radar frame' })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})
