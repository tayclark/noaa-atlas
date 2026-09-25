// Minimal SWPC responses for e2e mocking (#54), in the shapes src/data/swpcSchema.ts requires. The
// aurora band is deliberately unrealistic: it covers the globe's initial centre (the central US),
// so clicking the canvas centre lands in it, the same trick the mocked alert polygon uses.

import type { Page } from '@playwright/test'

export const AURORA_BAND_VALUE = 60
const BAND_LONS = { from: 250, to: 285 } // -110..-75 in OVATION's 0..359 convention
const BAND_LATS = { from: 30, to: 48 }

export function ovationFixture() {
  const coordinates: [number, number, number][] = [
    [0, 80, 0],
    [0, -80, 0],
  ]
  for (let lon = BAND_LONS.from; lon <= BAND_LONS.to; lon++) {
    for (let lat = BAND_LATS.from; lat <= BAND_LATS.to; lat++) coordinates.push([lon, lat, AURORA_BAND_VALUE])
  }
  return {
    'Observation Time': '2026-09-25T00:20:00Z',
    'Forecast Time': '2026-09-25T01:22:00Z',
    'Data Format': '[Longitude, Latitude, Aurora]',
    coordinates,
    type: 'MultiPoint',
  }
}

/** How many cells the globe should count as drawn: every non-zero one. */
export const AURORA_FIXTURE_CELLS = (BAND_LONS.to - BAND_LONS.from + 1) * (BAND_LATS.to - BAND_LATS.from + 1)

export function kpFixture() {
  return [
    { time_tag: '2026-09-25T00:26:00', kp_index: 6, estimated_kp: 6.33, kp: '6P' },
    { time_tag: '2026-09-25T00:27:00', kp_index: 7, estimated_kp: 6.67, kp: '7M' },
  ]
}

export async function mockSwpc(page: Page, { ovationStatus = 200 }: { ovationStatus?: number } = {}) {
  await page.route('**/json/ovation_aurora_latest.json', (route) =>
    ovationStatus === 200 ? route.fulfill({ json: ovationFixture() }) : route.fulfill({ status: ovationStatus, body: '' }),
  )
  await page.route('**/json/planetary_k_index_1m.json', (route) => route.fulfill({ json: kpFixture() }))
}
