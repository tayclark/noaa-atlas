// The graph under a finger (#78): a tap selects the nearest dot within reach (dots are a few pixels
// across and closer together than a fingertip), a finger pans and two pinch from anywhere, even
// from on a dot, and a tap on nothing dismisses the selection. Zoom buttons stand in for the pinch.

import { expect, test, type Page } from '@playwright/test'
import { mockAlerts, zoneOnlyAlertsFixture } from './fixtures/nwsAlerts'
import { mockSwpc } from './fixtures/swpc'
import { pinch, swipe, tapWithDrift, type Point } from './fixtures/touch'

async function openGraph(page: Page) {
  await mockAlerts(page, zoneOnlyAlertsFixture(1))
  await mockSwpc(page)
  await page.goto('/')
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
}

const layer = (page: Page) => page.locator('.graph-canvas svg > g').first()
const sheet = (page: Page) => page.getByLabel('Node detail')
const selectedNode = (page: Page) => page.locator('.graph-node[aria-pressed="true"]')

/** The scale and offset of the zoom layer. */
async function view(page: Page) {
  const transform = (await layer(page).getAttribute('transform')) ?? ''
  const [x, y] = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/.exec(transform)!.slice(1).map(Number) as [number, number]
  const k = Number(/scale\(([-\d.e]+)\)/.exec(transform)![1])
  return { x, y, k }
}

interface Dot extends Point {
  id: string
  r: number
  /** Distance to the nearest other dot. */
  nearest: number
}

/** The visible dot furthest from every other one, clear of the controls and the sheet. */
async function isolatedDot(page: Page): Promise<Dot> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect()
    const controls = document.querySelector('.graph-zoom-controls')!.getBoundingClientRect()
    const sheetTop = document.querySelector('.detail-sheet')?.getBoundingClientRect().top ?? canvas.bottom
    const dots = [...document.querySelectorAll<SVGCircleElement>('.graph-node:not(.graph-hidden) circle')].map((el) => {
      const box = el.getBoundingClientRect()
      return { id: (el.parentElement as unknown as SVGGElement).dataset.nodeId as string, x: box.x + box.width / 2, y: box.y + box.height / 2, r: box.width / 2 }
    })
    const usable = (d: { x: number; y: number }) =>
      d.x > canvas.left + 40 && d.x < canvas.right - 40 && d.y > canvas.top + 40 && d.y < Math.min(canvas.bottom, sheetTop) - 40 && !(d.x > controls.left - 40 && d.y < controls.bottom + 40)
    let best: (typeof dots)[number] & { nearest: number } = { ...dots[0]!, nearest: 0 }
    for (const dot of dots.filter(usable)) {
      const nearest = Math.min(...dots.filter((o) => o !== dot).map((o) => Math.hypot(o.x - dot.x, o.y - dot.y)))
      if (nearest > best.nearest) best = { ...dot, nearest }
    }
    return best
  })
}

/** The point on the canvas furthest from every dot, clear of the controls and the sheet. */
async function emptySpot(page: Page): Promise<Point & { clearance: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect()
    const controls = document.querySelector('.graph-zoom-controls')!.getBoundingClientRect()
    const sheetTop = document.querySelector('.detail-sheet')?.getBoundingClientRect().top ?? canvas.bottom
    // Whatever else is drawn over the canvas takes a tap itself.
    const overlays = ['.graph-search-results', '.graph-legend'].flatMap((selector) => {
      const el = document.querySelector(selector)
      return el ? [el.getBoundingClientRect()] : []
    })
    const dots = [...document.querySelectorAll<SVGCircleElement>('.graph-node:not(.graph-hidden) circle')].map((el) => {
      const box = el.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, r: box.width / 2 }
    })
    let best = { x: 0, y: 0, clearance: -1 }
    for (let x = canvas.left + 20; x < canvas.right - 20; x += 10) {
      for (let y = canvas.top + 20; y < Math.min(canvas.bottom, sheetTop) - 20; y += 10) {
        if (x > controls.left - 20 && y < controls.bottom + 20) continue
        if (overlays.some((o) => x > o.left - 10 && x < o.right + 10 && y > o.top - 10 && y < o.bottom + 10)) continue
        const clearance = Math.min(...dots.map((d) => Math.hypot(d.x - x, d.y - y) - d.r))
        if (clearance > best.clearance) best = { x, y, clearance }
      }
    }
    return best
  })
}

test('a tap on a dot selects it, without moving the layout', async ({ page }) => {
  await openGraph(page)
  const dot = await isolatedDot(page)
  await page.touchscreen.tap(dot.x, dot.y)

  await expect(selectedNode(page)).toHaveAttribute('data-node-id', dot.id)
  await expect(sheet(page)).toBeVisible()
  // A touch used to reheat the simulation (and drop this flag) whatever it did.
  await expect(page.locator('.graph-canvas svg')).toHaveAttribute('data-layout-settled', 'true')
})

test('a tap beside a dot, outside it but within reach, selects that dot', async ({ page }) => {
  await openGraph(page)
  const dot = await isolatedDot(page)
  expect(dot.nearest).toBeGreaterThan(60)
  // 16px from the dot's edge, towards where there is the most room.
  await page.touchscreen.tap(dot.x + dot.r + 16, dot.y)
  await expect(selectedNode(page)).toHaveAttribute('data-node-id', dot.id)
})

test('a tap whose finger drifts a few pixels still selects (the browser would withhold its click)', async ({ page }) => {
  await openGraph(page)
  const dot = await isolatedDot(page)
  await tapWithDrift(page, dot)
  await expect(selectedNode(page)).toHaveAttribute('data-node-id', dot.id)
})

test('a tap on nothing dismisses the selection and leaves the view alone', async ({ page }) => {
  await openGraph(page)
  const dot = await isolatedDot(page)
  await page.touchscreen.tap(dot.x, dot.y)
  await expect(sheet(page)).toBeVisible()
  await expect.poll(async () => (await view(page)).k).toBeGreaterThan(0)

  const spot = await emptySpot(page)
  expect(spot.clearance).toBeGreaterThan(40)
  const before = await view(page)
  await page.touchscreen.tap(spot.x, spot.y)
  await expect(sheet(page)).toHaveCount(0)
  await expect(selectedNode(page)).toHaveCount(0)
  // Dismissing is not a request to re-frame the whole graph.
  await page.waitForTimeout(300)
  expect(await view(page)).toEqual(before)
})

test('a finger that starts on a dot pans the view instead of dragging the dot or selecting it', async ({ page }) => {
  await openGraph(page)
  const dot = await isolatedDot(page)
  const node = page.locator(`.graph-node[data-node-id="${dot.id}"]`)
  const nodeBefore = await node.getAttribute('transform')
  const before = await view(page)

  await swipe(page, dot, { x: dot.x - 90, y: dot.y + 40 })

  const after = await view(page)
  expect(after.x - before.x).toBeCloseTo(-90, -1)
  expect(after.y - before.y).toBeCloseTo(40, -1)
  expect(after.k).toBeCloseTo(before.k, 5)
  expect(await node.getAttribute('transform')).toEqual(nodeBefore)
  await expect(selectedNode(page)).toHaveCount(0)
  await expect(page.locator('.graph-canvas svg')).toHaveAttribute('data-layout-settled', 'true')
})

test('two fingers pinch the graph in and out', async ({ page }) => {
  await openGraph(page)
  const canvas = (await page.locator('.graph-canvas').boundingBox())!
  const centre = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 }
  const before = await view(page)

  await pinch(page, centre, 80, 240)
  const zoomedIn = await view(page)
  expect(zoomedIn.k).toBeGreaterThan(before.k * 1.8)

  await pinch(page, centre, 240, 80)
  expect((await view(page)).k).toBeLessThan(zoomedIn.k * 0.7)
})

test('the zoom buttons zoom, and Fit frames the whole graph again', async ({ page }) => {
  await openGraph(page)
  const fitted = await view(page)

  await page.getByRole('button', { name: 'Zoom in' }).tap()
  await page.getByRole('button', { name: 'Zoom in' }).tap()
  const zoomedIn = await view(page)
  expect(zoomedIn.k).toBeGreaterThan(fitted.k * 1.4)

  await page.getByRole('button', { name: 'Zoom out' }).tap()
  expect((await view(page)).k).toBeLessThan(zoomedIn.k)

  await page.getByRole('button', { name: 'Fit graph' }).tap()
  const refitted = await view(page)
  expect(refitted.k).toBeCloseTo(fitted.k, 1)
  expect(refitted.x).toBeCloseTo(fitted.x, -1)
})

test('the controls are finger-sized', async ({ page }) => {
  await openGraph(page)
  const controls = [
    ...(await page.getByRole('group', { name: 'Zoom' }).getByRole('button').all()),
    page.getByRole('button', { name: 'Org view' }),
    page.getByRole('button', { name: 'Legend' }),
    page.getByRole('searchbox', { name: 'Search graph' }),
  ]
  for (const control of controls) {
    const box = await control.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
  }
})

test('the search lists matches by name, and picking one selects it', async ({ page }) => {
  await openGraph(page)
  const search = page.getByRole('searchbox', { name: 'Search graph' })
  await search.fill('tsunami')
  const results = page.getByRole('list', { name: 'Matching services' })
  await expect(results).toBeVisible()
  const first = results.getByRole('button').first()
  const name = (await first.locator('.graph-search-result-name').innerText()).trim()
  expect((await first.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)

  await first.tap()
  await expect(results).toHaveCount(0)
  await expect(sheet(page).getByRole('heading', { name })).toBeVisible()
  await expect(search).toHaveValue('')
})

test('the search clears from its own button, and its list closes on a tap on the graph', async ({ page }) => {
  await openGraph(page)
  const search = page.getByRole('searchbox', { name: 'Search graph' })
  await search.fill('weather')
  const results = page.getByRole('list', { name: 'Matching services' })
  await expect(results).toBeVisible()

  const spot = await emptySpot(page)
  await page.touchscreen.tap(spot.x, spot.y)
  await expect(results).toHaveCount(0)
  await expect(search).toHaveValue('weather')

  await page.getByRole('button', { name: 'Clear search' }).tap()
  await expect(search).toHaveValue('')
})

test('the legend opens over the graph, and a tap on the graph closes it', async ({ page }) => {
  await openGraph(page)
  await page.getByRole('button', { name: 'Legend' }).tap()
  const legend = page.getByLabel('Legend', { exact: true })
  await expect(legend).toBeVisible()
  expect(await legend.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto')

  const spot = await emptySpot(page)
  await page.touchscreen.tap(spot.x, spot.y)
  await expect(legend).toHaveCount(0)
})
