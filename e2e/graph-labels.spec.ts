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

// The simulation runs for several seconds and labels are only re-placed every few ticks, so a
// snapshot taken mid-layout can catch two labels drifting together. Wait for the final placement.
async function waitForSettledLayout(page: Page) {
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
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
  await waitForSettledLayout(page)

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
  await waitForSettledLayout(page)

  const node = page.locator('.graph-node', { has: page.locator('.graph-label-hidden') }).first()
  const label = node.locator('text')
  await expect(label).toBeHidden()
  await node.locator('circle').hover({ force: true })
  await expect(label).toBeVisible()
})

// #141: a selection is framed beside the detail panel, so its neighbours (and their labels)
// aren't hidden under it, and the panel can collapse to its title bar.
async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

test('a selected node and its neighbours are framed clear of the detail panel, labels visible', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await waitForSettledLayout(page)

  await selectByKeyboard(page, 'coops-data-api')
  const panel = page.getByLabel('Node detail')
  await expect(panel).toBeVisible()
  const framed = ['coops-data-api', 'coops-metadata-api', 'theme-ocean']
  await expect
    .poll(() =>
      page.evaluate((ids) => {
        const p = document.querySelector('.node-detail-panel')!.getBoundingClientRect()
        return ids.filter((id) => {
          const g = document.querySelector(`.graph-node[data-node-id="${id}"]`)!
          const c = g.querySelector('circle')!.getBoundingClientRect()
          const [cx, cy] = [c.x + c.width / 2, c.y + c.height / 2]
          const underPanel = cx > p.left && cx < p.right && cy > p.top && cy < p.bottom
          return underPanel || getComputedStyle(g.querySelector('text')!).visibility === 'hidden'
        })
      }, framed),
    )
    .toEqual([])
})

test('the detail panel collapses to its title bar and stays collapsed across selections', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await page.locator('.graph-node').first().waitFor()

  await selectByKeyboard(page, 'coops-data-api')
  const panel = page.getByLabel('Node detail')
  await page.getByRole('button', { name: 'Collapse details' }).click()
  await expect(panel.getByText('Base URL')).toHaveCount(0)
  expect((await panel.boundingBox())!.height).toBeLessThan(48)

  await selectByKeyboard(page, 'nws-api')
  await expect(panel.getByRole('heading', { name: 'NWS API' })).toBeVisible()
  await page.getByRole('button', { name: 'Expand details' }).click()
  await expect(panel.getByText('Base URL')).toBeVisible()
})
