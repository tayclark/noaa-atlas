// Accessibility baseline (#47): axe finds no serious or critical WCAG A/AA violations, the skip
// link and tabs work from the keyboard, and "reduce motion" settles the graph without animating.

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mappableAlertsFixture, mockAlerts, zoneOnlyAlertsFixture } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

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

test('the phone layout has no serious axe violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
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


test('an open alert popup has no serious axe violations (#86)', async ({ page }) => {
  await mockAlerts(page, mappableAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
  const globe = page.locator('[aria-label="Globe view of NOAA API coverage"]')
  await page.waitForTimeout(500)
  await globe.click()
  await expect(page.getByText('Flood Warning')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
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
