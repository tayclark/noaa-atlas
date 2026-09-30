// DART mock for e2e (#80). The station list is bundled (dartStations.json), so it is replaced with
// a single buoy at the globe's initial centre: the canvas centre then lands on it, as with the
// CO-OPS station fixture.

import type { Page } from '@playwright/test'

export const DART_STATION = { id: '21414', name: 'Test Buoy', lat: 39.8, lng: -98.5 }

/** Serves a one-buoy snapshot in place of dartStations.json (Vite serves JSON as a JS module). */
export async function mockDartStations(page: Page) {
  await page.route(/src\/data\/dartStations\.json/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify([DART_STATION])}` }),
  )
}
