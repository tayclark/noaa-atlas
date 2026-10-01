// Touch screens (#78): axe with the WCAG 2.2 rules, which add `target-size` (a control at least
// 24px square, or enough space around it). The `mobile` project emulates a coarse pointer, which is
// what switches on the finger-sized control sizes in index.css, so this is the one place they are
// checked. Each view is added here as its touch work lands.

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

async function openApp(page: Page) {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'Tasks', selected: true })).toBeVisible()
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

test('the Tasks tab, empty and with a task picked, has no serious violations', async ({ page }) => {
  await openApp(page)
  expect(await seriousViolations(page)).toEqual([])
  await page.getByRole('button', { name: 'See severe thunderstorm or tornado risk' }).tap()
  await expect(page.locator('.finder-node-button').first()).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test('the Compare tab, empty and filled, has no serious violations', async ({ page }) => {
  await openApp(page)
  await page.getByRole('tab', { name: 'Compare' }).tap()
  expect(await seriousViolations(page)).toEqual([])
  await page.getByRole('tab', { name: 'Tasks' }).tap()
  await page.getByRole('button', { name: 'See severe thunderstorm or tornado risk' }).tap()
  await page.getByRole('button', { name: 'Compare these' }).tap()
  await page.getByRole('tab', { name: /Compare/ }).tap()
  await expect(page.getByRole('columnheader')).toHaveCount(2)
  expect(await seriousViolations(page)).toEqual([])
})

test('the Inspector tab has no serious violations', async ({ page }) => {
  await openApp(page)
  await page.getByRole('tab', { name: 'Inspector' }).tap()
  expect(await seriousViolations(page)).toEqual([])
})

test('the About dialog has no serious violations', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'About this data' }).tap()
  await expect(page.getByRole('dialog', { name: 'About NOAA Atlas' })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test('the detail sheet, open and folded, has no serious violations', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'See severe thunderstorm or tornado risk' }).tap()
  await page.locator('.finder-node-button').first().tap()
  const sheet = page.getByLabel('Node detail')
  await expect(sheet.getByText('Base URL')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])

  await sheet.getByRole('button', { name: 'Collapse details' }).tap()
  await expect(page.locator('.detail-sheet-body')).toHaveAttribute('inert', '')
  expect(await seriousViolations(page)).toEqual([])
})

test('the Graph tab, with the search results and the legend open, has no serious violations', async ({ page }) => {
  await openApp(page)
  await page.getByRole('tab', { name: 'Graph' }).tap()
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
  expect(await seriousViolations(page)).toEqual([])

  await page.getByRole('searchbox', { name: 'Search graph' }).fill('tsunami')
  await expect(page.getByRole('list', { name: 'Matching services' })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])

  await page.getByRole('list', { name: 'Matching services' }).getByRole('button').first().tap()
  await page.getByRole('button', { name: 'Legend' }).tap()
  await expect(page.getByLabel('Legend', { exact: true })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})
