// The selection in the URL (#266): a link opens with its node, task or point selected, a bad one
// opens with nothing selected, and Back undoes a node selection.

import { expect, test } from '@playwright/test'
import { parseTasksFile } from '../src/data/taskSchema'
import tasksJson from '../src/data/tasks.json' with { type: 'json' }
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'
import { mockPointLookup } from './fixtures/nwsPoint'

// These specs don't measure the graph layout, so skip its settling animation (the slow part of every load).
test.use({ reducedMotion: 'reduce' })

const detail = (page: import('@playwright/test').Page) => page.getByLabel('Node detail')

test.beforeEach(async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
})

test('a node link opens with the node selected and its detail shown', async ({ page }) => {
  await page.goto('/#node=nws-api')
  await expect(page.locator('.graph-node[data-node-id="nws-api"]')).toHaveClass(/graph-node-highlighted/)
  await expect(detail(page).getByRole('heading', { name: 'NWS API' })).toBeVisible()
  await expect(page.getByLabel('Selection status')).toContainText('NWS API')
})

test('a task link opens with the task picked and its path highlighted', async ({ page }) => {
  const task = parseTasksFile(tasksJson).tasks.find((t) => t.nodes.length > 1)
  if (!task) throw new Error('expected a task with more than one step')
  await page.goto(`/#task=${task.id}`)
  await expect(page.getByRole('button', { name: task.label })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.graph-node-highlighted')).toHaveCount(task.nodes.length)
})

test('a point link frames the point and opens its forecast lookup', async ({ page }) => {
  await mockPointLookup(page)
  const pointRequest = page.waitForRequest((req) => req.url().includes('/points/'))
  await page.goto('/#point=-95.68,39.05')
  expect((await pointRequest).url()).toContain('/points/39.05,-95.68')
  await expect(page.locator('.maplibregl-popup')).toContainText('Sunny')
  await expect(page).toHaveURL(/#point=-95\.68,39\.05$/)
})

test('an unknown id opens with nothing selected and drops the hash', async ({ page }) => {
  await page.goto('/#node=not-a-node')
  await expect(page.locator('.graph-node[data-node-id="nws-api"]')).toBeVisible()
  await expect(page.locator('.graph-node-highlighted')).toHaveCount(0)
  await expect(page).not.toHaveURL(/#/)
})

test('selecting nodes updates the URL, and Back returns to the previous one', async ({ page }) => {
  await page.goto('/')
  for (const id of ['nws-api', 'spc-gis-data']) {
    const node = page.locator(`.graph-node[data-node-id="${id}"]`)
    await node.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`#node=${id}$`))
  }
  await page.goBack()
  await expect(page).toHaveURL(/#node=nws-api$/)
  await expect(page.locator('.graph-node[data-node-id="nws-api"]')).toHaveClass(/graph-node-highlighted/)
  await expect(detail(page).getByRole('heading', { name: 'NWS API' })).toBeVisible()
  await page.goBack()
  await expect(page.locator('.graph-node-highlighted')).toHaveCount(0)
  await page.goForward()
  await expect(page.locator('.graph-node[data-node-id="nws-api"]')).toHaveClass(/graph-node-highlighted/)
})
