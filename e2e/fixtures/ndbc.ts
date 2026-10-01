// NDBC mock for e2e. The station list is bundled (ndbcStations.json), so it is replaced with
// a single buoy at the globe's initial centre: the canvas centre then lands on it, as with the
// CO-OPS station fixture.

import type { Page } from '@playwright/test'

export const NDBC_STATION = { id: '41001', name: 'Test Buoy', lat: 39.8, lng: -98.5 }

/** Serves a one-buoy snapshot in place of ndbcStations.json (Vite serves JSON as a JS module). */
export async function mockNdbcStations(page: Page) {
  await page.route(/src\/data\/ndbcStations\.json/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify([NDBC_STATION])}` }),
  )
}
