// CO-OPS mocks for e2e (#51), in the shapes src/data/coopsSchema.ts requires. The station list is
// bundled (coopsStations.json), so it is replaced here with a single station at the globe's initial
// centre: the canvas centre then lands on it, the same trick the mocked alert polygon and aurora
// band use. The initial zoom equals the layer's minimum zoom, so the station is drawn on load.

import type { Page } from '@playwright/test'
import { makeHtfAnnual, makePredictions, makeSeaLevelTrend, makeStationMetadata, makeWaterLevel } from '../../src/data/coopsFixtures'
import { corsJson } from './cors'

export const STATION = { id: '8729108', name: 'Test Harbor', lat: 39.8, lng: -98.5, state: 'KS' }

/** Serves a one-station snapshot in place of coopsStations.json (Vite serves JSON as a JS module). */
export async function mockCoopsStations(page: Page) {
  await page.route(/src\/data\/coopsStations\.json/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify([STATION])}` }),
  )
}

/** The unit tests' reading, from the mocked station. */
export function waterLevelFixture() {
  return { ...makeWaterLevel(), metadata: { id: STATION.id, name: STATION.name, lat: '39.8', lon: '-98.5' } }
}

/**
 * The hourly curve behind the point timeline (#228): a day of tide around the clock. Unlike the unit
 * tests' three fixed hours, it is anchored to now, so the timeline's window takes it in.
 */
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
    return route.fulfill({ json: makePredictions() })
  })
}

/** The CO-OPS try-its (#241): Panama City's metadata, sea level trend and high tide flood days. */
export async function mockCoopsTryIts(page: Page) {
  await page.route(/^https:\/\/api\.tidesandcurrents\.noaa\.gov\/mdapi\/prod\/webapi\/stations\/8729108\.json/, (route) =>
    route.fulfill(corsJson(makeStationMetadata())),
  )
  await page.route(/^https:\/\/api\.tidesandcurrents\.noaa\.gov\/dpapi\/prod\/webapi\/product\/sealvltrends\.json/, (route) =>
    route.fulfill(corsJson(makeSeaLevelTrend())),
  )
  await page.route(/^https:\/\/api\.tidesandcurrents\.noaa\.gov\/dpapi\/prod\/webapi\/htf\/htf_annual\.json/, (route) =>
    route.fulfill(corsJson(makeHtfAnnual())),
  )
}
