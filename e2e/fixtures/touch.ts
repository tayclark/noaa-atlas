// Touch gestures for the phone project (#78). Playwright's touchscreen can only tap, so drags and
// pinches are sent as real touch events through the Chrome DevTools protocol.

import type { Page } from '@playwright/test'

export interface Point {
  x: number
  y: number
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
// A touch point is only an x and a y: the protocol rejects anything else, such as a node's id.
const at = ({ x, y }: Point): Point => ({ x, y })

/** The centre of an element's box, in page coordinates. */
export async function centreOf(page: Page, selector: string): Promise<Point> {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`expected ${selector} to be laid out`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** A one-finger drag from one point to another. */
export async function swipe(page: Page, from: Point, to: Point, { steps = 8, stepMs = 16 } = {}) {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(from)] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(lerp(from, to, i / steps))] })
      await page.waitForTimeout(stepMs)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await cdp.detach()
  }
}

/** A tap whose finger drifts a few pixels before lifting, as a real one does. */
export async function tapWithDrift(page: Page, spot: Point, drift = { x: 3, y: 2 }) {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(spot)] })
    await page.waitForTimeout(30)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: spot.x + drift.x, y: spot.y + drift.y }] })
    await page.waitForTimeout(30)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await cdp.detach()
  }
}

/** Two fingers moving apart (or together) about a point, level with each other. */
export async function pinch(page: Page, centre: Point, fromSpread: number, toSpread: number, { steps = 8, stepMs = 16 } = {}) {
  const cdp = await page.context().newCDPSession(page)
  const fingers = (spread: number) => [
    { x: centre.x - spread / 2, y: centre.y, id: 1 },
    { x: centre.x + spread / 2, y: centre.y, id: 2 },
  ]
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(fromSpread) })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(fromSpread + ((toSpread - fromSpread) * i) / steps) })
      await page.waitForTimeout(stepMs)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await cdp.detach()
  }
}
