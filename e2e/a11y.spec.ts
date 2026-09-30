// Accessibility baseline (#47): axe finds no serious or critical WCAG A/AA violations, the skip
// link and tabs work from the keyboard, and "reduce motion" settles the graph without animating.

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
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
  await expect(page.getByRole('tab', { name: 'Inspector' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Inspector' })).toHaveAttribute('aria-selected', 'true')
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
