// Minimal valid api.weather.gov point/forecast/station/observation responses for e2e mocking,
// matching the shapes src/data/nwsSchema.ts requires. Used only to keep the point-click
// forecast popup deterministic and fast — the linked-selection tests care about selectPoint()
// firing, not forecast content.

import type { Page } from '@playwright/test'

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
