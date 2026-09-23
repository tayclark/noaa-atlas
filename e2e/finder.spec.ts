// Task-finder golden path (#25 → #46, #34). The Explore tab shows the finder above the graph;
// picking a task highlights its whole recommended path in the graph, and clicking a step routes
// through the shared selectionStore (#43) to a single-node selection.

import { expect, test } from '@playwright/test'
import { parseTasksFile } from '../src/data/taskSchema'
import tasksJson from '../src/data/tasks.json' with { type: 'json' }
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

test('picking a task highlights its whole path in the graph, with connectors', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')

  const tasks = parseTasksFile(tasksJson).tasks
  const task = tasks.find((t) => t.nodes.length >= 2)
  if (!task) throw new Error('expected an authored task with at least two nodes')

  await page.locator('.finder-task-item', { hasText: task.label }).click()

  const highlighted = page.locator('.graph-node-highlighted')
  await expect(highlighted).toHaveCount(task.nodes.length)
  for (const { nodeId } of task.nodes) {
    await expect(page.locator(`.graph-node[data-node-id="${nodeId}"]`)).toHaveClass(/graph-node-highlighted/)
  }
  await expect(page.locator('.graph-path-edge')).toHaveCount(task.nodes.length - 1)
})

test('clicking a path step narrows the highlight to that one node', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')

  await page.locator('.finder-task-item').first().click()
  const steps = page.locator('ol[aria-label="Recommended nodes"] .finder-node-button')
  await expect(steps.first()).toBeVisible()
  const firstNodeText = await steps.first().locator('.finder-node-name').innerText()
  await steps.first().click()

  const highlighted = page.locator('.graph-node-highlighted')
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted.locator('text')).toContainText(firstNodeText)
  await expect(page.locator('.graph-path-edge')).toHaveCount(0)
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
