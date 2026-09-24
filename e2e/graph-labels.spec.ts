// Graph label decluttering (#138): at the default fit, visible labels never overlap, stay a
// readable size and inside the canvas, and a hidden label shows on hover.

import { expect, test, type Page } from '@playwright/test'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

interface LabelBox {
  id: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
}

async function visibleLabels(page: Page): Promise<{ labels: LabelBox[]; canvas: DOMRect }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect()
    const labels = [...document.querySelectorAll<SVGTextElement>('.graph-node text')]
      .filter((el) => getComputedStyle(el).visibility !== 'hidden')
      .map((el) => {
        const r = el.getBoundingClientRect()
        const id = el.closest<SVGGElement>('.graph-node')!.dataset.nodeId!
        return { id, x: r.x, y: r.y, w: r.width, h: r.height, fontSize: parseFloat(getComputedStyle(el).fontSize) * (el.getScreenCTM()?.a ?? 1) }
      })
    return { labels, canvas: canvas.toJSON() as DOMRect }
  })
}

test('visible labels do not overlap, stay legible and fit inside the canvas', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await page.locator('.graph-node').first().waitFor()
  // The layout settles and places labels once the simulation ends.
  await expect(page.locator('.graph-label-hidden').first()).toBeAttached()
  await page.waitForTimeout(3000)

  const { labels, canvas } = await visibleLabels(page)
  expect(labels.filter((l) => l.id.startsWith('theme-'))).toHaveLength(10)

  const overlaps: string[] = []
  for (const [i, a] of labels.entries()) {
    for (const b of labels.slice(i + 1)) {
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${a.id} / ${b.id}`)
    }
  }
  expect(overlaps).toEqual([])

  for (const l of labels) {
    expect(l.fontSize, l.id).toBeGreaterThanOrEqual(11)
    expect(l.x, l.id).toBeGreaterThanOrEqual(canvas.x - 1)
    expect(l.x + l.w, l.id).toBeLessThanOrEqual(canvas.x + canvas.width + 1)
  }
})

test('hovering a node reveals its hidden label', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  const hidden = page.locator('.graph-label-hidden').first()
  await expect(hidden).toBeAttached()
  await page.waitForTimeout(3000)

  const node = page.locator('.graph-node', { has: page.locator('.graph-label-hidden') }).first()
  const label = node.locator('text')
  await expect(label).toBeHidden()
  await node.locator('circle').hover({ force: true })
  await expect(label).toBeVisible()
})
