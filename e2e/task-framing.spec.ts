// Task framing (#162): picking any task frames its path so that every step on screen has a
// placed label inside the canvas. A path too spread out to read whole (e.g. NWS API far from
// the gridded-model cluster) frames its largest group of steps instead.

import { expect, test } from '@playwright/test'
import { parseTasksFile } from '../src/data/taskSchema'
import tasksJson from '../src/data/tasks.json' with { type: 'json' }
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

test('every task frames its on-screen steps with placed labels inside the canvas', async ({ page }) => {
  // One pass over all ~30 tasks: ~20s locally, longer on CI runners.
  test.setTimeout(120_000)
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })

  for (const task of parseTasksFile(tasksJson).tasks) {
    await page.locator('.finder-task-item', { hasText: task.label }).click()
    await expect(page.locator('.graph-node-highlighted')).toHaveCount(task.nodes.length)

    const problems = await page.evaluate(() => {
      const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect()
      const inside = (r: DOMRect) => r.left >= canvas.left - 0.5 && r.right <= canvas.right + 0.5 && r.top >= canvas.top - 0.5 && r.bottom <= canvas.bottom + 0.5
      return [...document.querySelectorAll<SVGGElement>('.graph-node-highlighted')].flatMap((node) => {
        const circle = node.querySelector('circle')!.getBoundingClientRect()
        const centre = new DOMRect(circle.x + circle.width / 2, circle.y + circle.height / 2, 0, 0)
        if (!inside(centre)) return [] // an outlying step, framed out on purpose
        const text = node.querySelector('text')!
        if (text.classList.contains('graph-label-hidden')) return [`${node.dataset.nodeId}: label not placed`]
        return inside(text.getBoundingClientRect()) ? [] : [`${node.dataset.nodeId}: label outside the canvas`]
      })
    })
    expect(problems, task.label).toEqual([])
  }
})
