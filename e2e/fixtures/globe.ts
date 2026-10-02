// The globe's map, and a wait for it to be ready. The globe loads on demand (#264), after the graph
// paints, and its first renders are slow on a CI runner's software GL, so a spec that selects a
// map-layer node straight after `goto` leaves its 5 s expect to cover all of that (#298). Wait here
// first, so the layer's own assertions start from a loaded map.

import type { Page } from '@playwright/test'

export const GLOBE = '[aria-label="Globe view of NOAA API coverage"]'

/** Resolves once the map has loaded (`data-coops-stations` is set on its `load`). */
export async function waitForGlobe(page: Page) {
  await page.locator(`${GLOBE}[data-coops-stations]`).waitFor({ state: 'attached', timeout: 20_000 })
}
