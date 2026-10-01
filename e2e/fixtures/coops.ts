// CO-OPS mocks for e2e (#51), in the shapes src/data/coopsSchema.ts requires. The station list is
// bundled (coopsStations.json), so it is replaced here with a single station at the globe's initial
// centre: the canvas centre then lands on it, the same trick the mocked alert polygon and aurora
// band use. The initial zoom equals the layer's minimum zoom, so the station is drawn on load.

import type { Page } from '@playwright/test'

export const STATION = { id: '8729108', name: 'Test Harbor', lat: 39.8, lng: -98.5, state: 'KS' }

/** Serves a one-station snapshot in place of coopsStations.json (Vite serves JSON as a JS module). */
export async function mockCoopsStations(page: Page) {
  await page.route(/src\/data\/coopsStations\.json/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify([STATION])}` }),
  )
}

export function waterLevelFixture() {
  return {
    metadata: { id: STATION.id, name: STATION.name, lat: '39.8', lon: '-98.5' },
    data: [{ t: '2026-09-30 13:48', v: '0.403', s: '0.006', f: '1,0,0,0', q: 'p' }],
  }
}

export function predictionsFixture() {
  return {
    predictions: [
      { t: '2026-09-30 04:34', v: '0.598', type: 'H' },
      { t: '2026-09-30 15:46', v: '0.073', type: 'L' },
    ],
  }
}

/** The hourly curve behind the point timeline (#228): a day of tide around the clock. */
export function hourlyPredictionsFixture() {
  const hour = 3_600_000
  const start = Math.floor(Date.now() / hour) * hour - 24 * hour
  return {
    predictions: Array.from({ length: 96 }, (_, i) => ({
      t: new Date(start + i * hour).toISOString().slice(0, 16).replace('T', ' '),
      v: (0.4 + 0.3 * Math.sin(i / 2)).toFixed(3),
    })),
  }
}

/** Mocks the station list and both data calls; `waterLevelError` makes water_level answer with CO-OPS's HTTP 200 error body. */
export async function mockCoops(page: Page, { waterLevelError }: { waterLevelError?: string } = {}) {
  await mockCoopsStations(page)
  await page.route('**/api/prod/datagetter**', (route) => {
    const product = new URL(route.request().url()).searchParams.get('product')
    if (product === 'water_level') {
      return route.fulfill({ json: waterLevelError ? { error: { message: waterLevelError } } : waterLevelFixture() })
    }
    if (new URL(route.request().url()).searchParams.get('interval') === 'h') {
      return route.fulfill({ json: hourlyPredictionsFixture() })
    }
    return route.fulfill({ json: predictionsFixture() })
  })
}
