// Graph helpers shared by the specs. Nodes are selected by keyboard (CLAUDE.md): the graph
// re-frames after every selection, so a clicked node can end up under the globe canvas.

import { expect, type Page } from '@playwright/test'
import { mockAlerts, zoneOnlyAlertsFixture } from './nwsAlerts'
import { mockSwpc } from './swpc'

/** Set on the graph's svg once the layout has settled. */
export const LAYOUT_SETTLED = '.graph-canvas svg[data-layout-settled]'

export async function selectByKeyboard(page: Page, nodeId: string) {
  await page.locator(`.graph-node[data-node-id="${nodeId}"]`).focus()
  await page.keyboard.press('Enter')
}

/** Phone: taps the Graph tab and waits for the layout to settle. */
export async function showGraphTab(page: Page) {
  await page.getByRole('tab', { name: /Graph/ }).tap()
  await expect(page.locator(LAYOUT_SETTLED)).toBeAttached({ timeout: 20_000 })
}

/**
 * Phone: loads the app on the Graph tab with the layout settled. By default it mocks one zone-only
 * alert and SWPC first; pass `mocks: false` when the spec's beforeEach has mocked them already.
 */
export async function openGraph(page: Page, { mocks = true }: { mocks?: boolean } = {}) {
  if (mocks) {
    await mockAlerts(page, zoneOnlyAlertsFixture(1))
    await mockSwpc(page)
  }
  await page.goto('/')
  await showGraphTab(page)
}

/** The selected node's detail (the side panel, or the phone's bottom sheet). */
export const nodeSheet = (page: Page) => page.getByLabel('Node detail')
