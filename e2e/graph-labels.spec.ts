// Graph label decluttering (#138): at the default fit, visible labels never overlap, stay a
// readable size and inside the canvas, and a hidden label shows on hover.

import { expect, test, type Page } from '@playwright/test'
import { overlapping, switchView, visibleLabels, waitForSettledLayout } from './fixtures/graphLabels'
import { emptyAlertsFixture, mockAlerts } from './fixtures/nwsAlerts'

// Reduced motion lays the graph out in one go instead of animating the ~6.5 s settle, and these
// specs assert the settled layout, not the animation.
test.use({ reducedMotion: 'reduce' })

async function expectTidyLabels(page: Page) {
  const { labels, canvas } = await visibleLabels(page)
  expect(overlapping(labels)).toEqual([])
  for (const l of labels) {
    expect(l.fontSize, l.id).toBeGreaterThanOrEqual(11)
    expect(l.x, l.id).toBeGreaterThanOrEqual(canvas.x - 1)
    expect(l.x + l.w, l.id).toBeLessThanOrEqual(canvas.x + canvas.width + 1)
  }
  return labels
}

test('visible labels do not overlap, stay legible and fit inside the canvas', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await waitForSettledLayout(page)

  const labels = await expectTidyLabels(page)
  expect(labels.filter((l) => l.id.startsWith('theme-'))).toHaveLength(10)
})

// #292: the access hubs are `.graph-org-node`s, which the check above never saw.
const ACCESS_HUBS = ['access-rest', 'access-arcgis-rest', 'access-ogc', 'access-cloud-bucket', 'access-file-download']

for (const viewport of [null, { width: 1400, height: 900 }]) {
  test.describe(viewport ? `at ${viewport.width}x${viewport.height}` : 'at the default viewport', () => {
    if (viewport) test.use({ viewport })

    test('the access view labels every hub, with no labels overlapping', async ({ page }) => {
      await mockAlerts(page, emptyAlertsFixture())
      await page.goto('/')
      await waitForSettledLayout(page)
      await switchView(page, 'Access view')

      const labels = await expectTidyLabels(page)
      expect(labels.filter((l) => l.id.startsWith('access-')).map((l) => l.id).sort()).toEqual([...ACCESS_HUBS].sort())
    })
  })
}

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

// #145: a theme hub gets a panel too, and its services are framed clear of it.
test('a selected theme hub opens its panel, with its services framed clear of it', async ({ page }) => {
  await mockAlerts(page, emptyAlertsFixture())
  await page.goto('/')
  await waitForSettledLayout(page)

  await selectByKeyboard(page, 'theme-ocean')
  const panel = page.getByLabel('Node detail')
  await expect(panel.getByRole('heading', { name: 'Ocean & coastal' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'CO-OPS Data API' })).toBeVisible()
  const framed = ['theme-ocean', 'coops-data-api', 'coops-metadata-api']
  await expect
    .poll(() =>
      page.evaluate((ids) => {
        const p = document.querySelector('.node-detail-panel')!.getBoundingClientRect()
        return ids.filter((id) => {
          const c = document.querySelector(`.graph-node[data-node-id="${id}"] circle`)!.getBoundingClientRect()
          const [cx, cy] = [c.x + c.width / 2, c.y + c.height / 2]
          return cx > p.left && cx < p.right && cy > p.top && cy < p.bottom
        })
      }, framed),
    )
    .toEqual([])

  await panel.getByRole('button', { name: 'CO-OPS Data API' }).click()
  await expect(panel.getByText('Base URL')).toBeVisible()
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
