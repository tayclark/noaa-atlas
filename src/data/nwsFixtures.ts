// Small plain-object fixtures used by the NWS client/schema tests. Kept as untyped data on
// purpose, so tests can break individual fields and assert that validation rejects them.

export function makeAlertFeature(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'Feature',
    properties: {
      id: 'urn:oid:2.49.0.1.840.0.alert-1',
      event: 'Winter Storm Warning',
      headline: 'Winter Storm Warning issued',
      severity: 'Severe',
      areaDesc: 'King County, WA',
      effective: '2026-09-21T00:00:00-07:00',
      expires: '2026-09-22T00:00:00-07:00',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[[-122.5, 47.5], [-122.3, 47.5], [-122.3, 47.7], [-122.5, 47.7], [-122.5, 47.5]]],
    },
    ...overrides,
  }
}

export function makeAlertCollection(features: unknown[] = [makeAlertFeature()]): Record<string, unknown> {
  return { type: 'FeatureCollection', features }
}

export function makePoint(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    properties: {
      gridId: 'SEW',
      gridX: 125,
      gridY: 68,
      forecast: 'https://api.weather.gov/gridpoints/SEW/125,68/forecast',
      forecastGridData: 'https://api.weather.gov/gridpoints/SEW/125,68',
      forecastHourly: 'https://api.weather.gov/gridpoints/SEW/125,68/forecast/hourly',
      observationStations: 'https://api.weather.gov/gridpoints/SEW/125,68/stations',
      relativeLocation: { properties: { city: 'Seattle', state: 'WA' } },
      ...overrides,
    },
  }
}

export function makeForecastPeriod(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 1,
    name: 'Tonight',
    startTime: '2026-09-21T18:00:00-07:00',
    endTime: '2026-09-22T06:00:00-07:00',
    temperature: 52,
    temperatureUnit: 'F',
    windSpeed: '5 mph',
    windDirection: 'SW',
    shortForecast: 'Mostly Clear',
    detailedForecast: 'Mostly clear, with a low around 52.',
    ...overrides,
  }
}

export function makeGridpointForecast(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    properties: {
      updated: '2026-09-21T12:00:00-07:00',
      periods: [makeForecastPeriod()],
      ...overrides,
    },
  }
}

export function makeStation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    properties: { stationIdentifier: 'KSEA', name: 'Seattle-Tacoma International Airport' },
    geometry: { type: 'Point', coordinates: [-122.31, 47.44] },
    ...overrides,
  }
}

export function makeStationCollection(features: unknown[] = [makeStation()]): Record<string, unknown> {
  return { type: 'FeatureCollection', features }
}

export function makeObservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    properties: {
      timestamp: '2026-09-21T18:00:00-07:00',
      textDescription: 'Mostly Cloudy',
      temperature: { value: 15.6, unitCode: 'wmoUnit:degC' },
      windSpeed: { value: 8.3, unitCode: 'wmoUnit:km_h-1' },
      windDirection: { value: 220, unitCode: 'wmoUnit:degree_(angle)' },
      ...overrides,
    },
  }
}
