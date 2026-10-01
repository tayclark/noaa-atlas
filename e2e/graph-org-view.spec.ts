// Org view (#58): the toggle swaps the theme hubs for an office/program tree and back.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

test('the org view shows office hubs instead of theme hubs, and toggles back', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)
  await page.goto('/')
  const svg = page.locator('svg[aria-label="Service graph"]')
  await expect(svg).toHaveAttribute('data-layout-settled', 'true', { timeout: 20_000 })

  const toggle = page.getByRole('button', { name: 'Org view' })
  await expect(page.locator('[data-node-id="theme-weather"]')).toBeVisible()
  await expect(page.locator('[data-node-id="office-nws"]')).toBeHidden()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-node-id="office-nws"]')).toBeVisible()
  await expect(page.locator('[data-node-id="program-nws-ncep"]')).toBeVisible()
  await expect(page.locator('[data-node-id="theme-weather"]')).toBeHidden()
  await expect(svg).toHaveAttribute('data-layout-settled', 'true', { timeout: 20_000 })

  // The tree runs left to right: root, office, program, then its services.
  const x = async (id: string) => (await page.locator(`[data-node-id="${id}"]`).boundingBox())!.x
  expect(await x('noaa')).toBeLessThan(await x('office-nws'))
  expect(await x('office-nws')).toBeLessThan(await x('program-nws-ncep'))
  expect(await x('program-nws-ncep')).toBeLessThan(await x('nomads'))

  // Services stay selectable by keyboard in either view.
  await page.locator('.graph-node[data-node-id="nws-api"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'NWS API', exact: false }).first()).toBeVisible()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-node-id="theme-weather"]')).toBeVisible()
  await expect(page.locator('[data-node-id="office-nws"]')).toBeHidden()
})
