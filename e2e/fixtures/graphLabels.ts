// Shared by the graph label specs (#138, #292): the on-screen boxes of the graph's visible labels.

import { expect, type Page } from '@playwright/test'

export interface LabelBox {
  id: string
  x: number
  y: number
  w: number
  h: number
  fontSize: number
}

// The simulation runs for several seconds and labels are only re-placed every few ticks, so a
// snapshot taken mid-layout can catch two labels drifting together. Wait for the final placement.
export async function waitForSettledLayout(page: Page) {
  await expect(page.locator('.graph-canvas svg[data-layout-settled]')).toBeAttached({ timeout: 20_000 })
}

/** Switches the layout and waits for the re-laid graph to settle. */
export async function switchView(page: Page, name: 'Theme view' | 'Org view' | 'Access view') {
  const toggle = page.getByRole('button', { name })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await waitForSettledLayout(page)
}

/** Service labels (`.graph-node`) and org/access hub labels (`.graph-org-node`) that are shown in the current view. */
export async function visibleLabels(page: Page): Promise<{ labels: LabelBox[]; canvas: DOMRect }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect()
    const labels = [...document.querySelectorAll<SVGTextElement>('.graph-node text, .graph-org-node text')]
      .filter((el) => getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0)
      .map((el) => {
        const r = el.getBoundingClientRect()
        const id = el.closest<SVGGElement>('[data-node-id]')!.dataset.nodeId!
        return { id, x: r.x, y: r.y, w: r.width, h: r.height, fontSize: parseFloat(getComputedStyle(el).fontSize) * (el.getScreenCTM()?.a ?? 1) }
      })
    return { labels, canvas: canvas.toJSON() as DOMRect }
  })
}

const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Every pair of labels whose boxes overlap, as "a / b". */
export function overlapping(labels: readonly LabelBox[]): string[] {
  const pairs: string[] = []
  for (const [i, a] of labels.entries()) for (const b of labels.slice(i + 1)) if (intersects(a, b)) pairs.push(`${a.id} / ${b.id}`)
  return pairs
}

/** The labels whose boxes reach into `area`. */
export function labelsIn(labels: readonly LabelBox[], area: { x: number; y: number; width: number; height: number }): string[] {
  return labels.filter((l) => intersects(l, { x: area.x, y: area.y, w: area.width, h: area.height })).map((l) => l.id)
}
