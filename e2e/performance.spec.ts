// Interaction budget (#47), measured against mocked network on the dev server. The limits are
// deliberately loose (CI runners are slower than a laptop, and the dev server is unminified): they
// catch a regression of an order of magnitude, not a few percent. The bundle-size budget lives in
// scripts/checkBundleBudget.mjs.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'

const BUDGET_MS = {
  /** Navigation start to the first graph node being visible. The layout keeps easing for a few
   *  seconds after that (a fixed-rate d3 simulation, about 6.5 s here), so settling isn't measured. */
  firstNodeVisible: 2_000,
  /** Selecting a node (Enter on a focused node) to its detail panel showing. */
  selectToDetail: 1_000,
}

test('the first node appears and a selection shows its detail within budget', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await mockSwpc(page)

  const started = Date.now()
  await page.goto('/')
  await expect(page.locator('.graph-node').first()).toBeVisible({ timeout: 20_000 })
  const firstNodeVisible = Date.now() - started
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })

  const node = page.locator('.graph-node[data-node-id="nws-api"]')
  await node.focus()
  const selected = Date.now()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Node detail')).toBeVisible()
  const selectToDetail = Date.now() - selected

  console.log(`first node visible in ${firstNodeVisible} ms, selection to detail in ${selectToDetail} ms`)
  expect(firstNodeVisible).toBeLessThan(BUDGET_MS.firstNodeVisible)
  expect(selectToDetail).toBeLessThan(BUDGET_MS.selectToDetail)
})
