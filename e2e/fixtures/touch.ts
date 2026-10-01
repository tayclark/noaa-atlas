// Touch gestures for the phone project (#78). Playwright's touchscreen can only tap, so drags and
// pinches are sent as real touch events through the Chrome DevTools protocol.

import type { Page } from '@playwright/test'

export interface Point {
  x: number
  y: number
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

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
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [lerp(from, to, i / steps)] })
      await page.waitForTimeout(stepMs)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await cdp.detach()
  }
}
