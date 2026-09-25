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

// #161: at the default viewport the finder pane is ~225px tall. The task list gives up height
// first, so the intro and a picked task's first step both fit inside the pane.
test('the intro and the first step fit the finder pane at 1280x720', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

  const pane = page.locator('.left-panel-explore-finder')
  const inside = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox()
    const paneBox = await pane.boundingBox()
    if (!box || !paneBox) throw new Error(`no box for ${selector}`)
    expect(box.y).toBeGreaterThanOrEqual(paneBox.y)
    expect(box.y + box.height).toBeLessThanOrEqual(paneBox.y + paneBox.height + 0.5)
  }

  await inside('.finder-intro')

  const task = parseTasksFile(tasksJson).tasks.find((t) => t.nodes.length >= 2)
  if (!task) throw new Error('expected an authored task with at least two nodes')
  await page.locator('.finder-task-item', { hasText: task.label }).click()
  await inside('.finder-node-item')
  await inside('.finder-task-item-selected')
})
