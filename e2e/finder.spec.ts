// AC1: task-finder golden path (#25 → #46). Finder is the LeftPanel's default tab; picking a
// task shows its ranked nodes, and clicking a node routes through the shared selectionStore
// (#43) — proven here by checking the highlight actually lands in the Graph tab, not just that
// the button is clickable.

import { expect, test } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

test('picking a task and a node highlights that node in the graph', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')

  const taskButtons = page.locator('.finder-task-item')
  await expect(taskButtons.first()).toBeVisible()
  const taskCount = await taskButtons.count()
  expect(taskCount).toBeGreaterThan(0)

  const nodeList = page.locator('ul[aria-label="Recommended nodes"] .finder-node-button')
  await expect(nodeList.first()).toBeVisible()

  const firstNodeText = await nodeList.first().locator('.finder-node-name').innerText()
  await nodeList.first().click()

  await page.getByRole('tab', { name: 'Graph' }).click()
  const highlighted = page.locator('.graph-node-highlighted')
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted.locator('text')).toContainText(firstNodeText)
})

test('switching tasks changes the ranked node list', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')

  const taskButtons = page.locator('.finder-task-item')
  const taskCount = await taskButtons.count()
  test.skip(taskCount < 2, 'only one task authored — nothing to switch between')

  const firstTaskNodes = await page.locator('.finder-node-button').allInnerTexts()
  await taskButtons.nth(1).click()
  const secondTaskNodes = await page.locator('.finder-node-button').allInnerTexts()

  expect(secondTaskNodes).not.toEqual(firstTaskNodes)
})
