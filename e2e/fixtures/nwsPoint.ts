// Minimal valid api.weather.gov point/forecast/station/observation responses for e2e mocking,
// matching the shapes src/data/nwsSchema.ts requires. Used only to keep the point-click
// forecast popup deterministic and fast — the linked-selection tests care about selectPoint()
// firing, not forecast content.

import type { Page } from '@playwright/test'
import { NHC_URL } from './nhc'

const WFO = 'TOP'
const GRID_X = 31
const GRID_Y = 80
const STATION_ID = 'KTOP'

export async function mockPointLookup(page: Page) {
  await page.route('**/points/**', (route) =>
    route.fulfill({
      json: {
        properties: {
          gridId: WFO,
          gridX: GRID_X,
          gridY: GRID_Y,
          forecast: `https://api.weather.gov/gridpoints/${WFO}/${GRID_X},${GRID_Y}/forecast`,
          forecastGridData: `https://api.weather.gov/gridpoints/${WFO}/${GRID_X},${GRID_Y}`,
          forecastHourly: `https://api.weather.gov/gridpoints/${WFO}/${GRID_X},${GRID_Y}/forecast/hourly`,
          observationStations: `https://api.weather.gov/gridpoints/${WFO}/${GRID_X},${GRID_Y}/stations`,
          relativeLocation: { properties: { city: 'Test City', state: 'KS' } },
        },
      },
    }),
  )
  // The point forecast timeline (#228) asks for the grid on every point; specs that don't look at
  // it get an answer that fails fast instead of reaching the real service.
  await page.route(`**/gridpoints/${WFO}/${GRID_X},${GRID_Y}`, (route) => route.fulfill({ status: 503, json: {} }))
  // A selected point also fetches the NHC storm layers for the hurricane impact prompt (#344); without a
  // storm mock of their own (registered later, so it wins), specs see a quiet season.
  await page.route(NHC_URL, (route) =>
    route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { type: 'FeatureCollection', features: [] } }),
  )
  await page.route('**/gridpoints/**/forecast', (route) =>
    route.fulfill({
      json: {
        properties: {
          updated: '2026-09-23T00:00:00-05:00',
          periods: [
            {
              number: 1,
              name: 'Today',
              startTime: '2026-09-23T06:00:00-05:00',
              endTime: '2026-09-23T18:00:00-05:00',
              temperature: 75,
              temperatureUnit: 'F',
              windSpeed: '10 mph',
              windDirection: 'NW',
              shortForecast: 'Sunny',
              detailedForecast: 'Sunny, with a high near 75.',
            },
          ],
        },
      },
    }),
  )
  await page.route('**/gridpoints/**/stations', (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { stationIdentifier: STATION_ID, name: 'Test Station' },
            geometry: { type: 'Point', coordinates: [-95.6, 39.1] },
          },
        ],
      },
    }),
  )
  await page.route('**/stations/*/observations/latest', (route) =>
    route.fulfill({
      json: {
        properties: {
          timestamp: '2026-09-23T12:00:00-05:00',
          textDescription: 'Sunny',
          temperature: { value: 24, unitCode: 'wmoUnit:degC' },
          windSpeed: { value: 4.5, unitCode: 'wmoUnit:km_h-1' },
          windDirection: { value: 300, unitCode: 'wmoUnit:degree_(angle)' },
        },
      },
    }),
  )
}

/**
 * The raw forecast grid for the point timeline (#228): 48 hourly wind samples starting three hours
 * back, so "now" falls inside. `waves: false` answers like an inland point (no unit, no values).
 */
export async function mockGridpointData(page: Page, { waves = true } = {}) {
  const hour = 3_600_000
  const start = Math.floor(Date.now() / hour) * hour - 3 * hour
  const hourly = (value: (i: number) => number) =>
    Array.from({ length: 48 }, (_, i) => ({ validTime: `${new Date(start + i * hour).toISOString()}/PT1H`, value: value(i) }))
  await page.route(`**/gridpoints/${WFO}/${GRID_X},${GRID_Y}`, (route) =>
    route.fulfill({
      json: {
        properties: {
          windSpeed: { uom: 'wmoUnit:km_h-1', values: hourly((i) => 10 + (i % 24)) },
          windDirection: { uom: 'wmoUnit:degree_(angle)', values: hourly(() => 225) },
          windGust: { uom: 'wmoUnit:km_h-1', values: hourly((i) => 20 + (i % 24)) },
          waveHeight: waves
            ? { uom: 'wmoUnit:m', values: hourly((i) => (i % 12 < 6 ? 0.3048 : 0.6096)) }
            : {},
        },
      },
    }),
  )
  return start
}
