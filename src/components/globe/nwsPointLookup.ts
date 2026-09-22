// Pure helpers for the point-click forecast/observation lookup (#39). Kept out of
// MapLibreGlobe.tsx so the nearest-station selection and popup formatting are unit-testable —
// MapLibreGlobe.tsx itself is excluded from coverage and verified manually in the browser
// (see vite.config.ts).

import { NwsHttpError, NwsParseError } from '../../data/nwsClient'
import type { NwsForecastPeriod, NwsObservation, NwsStation, NwsStationCollection } from '../../data/nwsSchema'

/**
 * Picks the station closest to (lat, lon) by simple squared-distance-in-degrees. NWS's own
 * station-list ordering is empirically nearest-first but isn't a documented API contract, and
 * it's ordered from the gridpoint centroid rather than the exact click point — so distance is
 * computed explicitly instead of trusting response order. True great-circle distance isn't
 * needed at NWS station spacing/scale.
 */
export function pickNearestStation(
  stations: NwsStationCollection,
  lat: number,
  lon: number,
): NwsStation | undefined {
  let nearest: NwsStation | undefined
  let nearestDistance = Infinity

  for (const station of stations.features) {
    const [stationLon, stationLat] = station.geometry.coordinates
    const distance = (stationLat - lat) ** 2 + (stationLon - lon) ** 2
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = station
    }
  }

  return nearest
}

export interface PointPopupContent {
  location: string
  shortForecast: string
  temperatureF: number | null
  windSummary: string
  observedAt: string
}

const CELSIUS_UNIT_CODE = 'wmoUnit:degC'

/** Converts an NWS measurement value to Fahrenheit, or null if the sensor reported no value. */
function toFahrenheit(value: number | null, unitCode: string): number | null {
  if (value === null) return null
  if (unitCode === CELSIUS_UNIT_CODE) return Math.round((value * 9) / 5 + 32)
  return Math.round(value)
}

/**
 * Formats the nearest station's latest observation plus the first forecast period ("today"/
 * "tonight") for the click popup (#39 AC). Observations report temperature in Celsius while
 * forecast periods report Fahrenheit — both are normalized to Fahrenheit here so the popup
 * doesn't silently mix units.
 */
export function describePointForPopup(period: NwsForecastPeriod, observation: NwsObservation): PointPopupContent {
  const { temperature, windSpeed, windDirection, textDescription, timestamp } = observation.properties
  const temperatureF = toFahrenheit(temperature.value, temperature.unitCode)
  const windSummary =
    windSpeed.value === null
      ? 'Calm'
      : `${Math.round(windSpeed.value)} ${windSpeed.unitCode.replace('wmoUnit:', '')}${
          windDirection.value === null ? '' : ` at ${Math.round(windDirection.value)}°`
        }`

  return {
    location: period.name,
    shortForecast: textDescription || period.shortForecast,
    temperatureF,
    windSummary,
    observedAt: new Date(timestamp).toLocaleString(),
  }
}

/** Builds a human-readable message for a failed point lookup, based on the error kind. */
export function describePointError(err: unknown): string {
  if (err instanceof NwsHttpError) {
    if (err.kind === 'rate-limited') return 'NWS rate limit exceeded — try again shortly.'
    if (err.kind === 'server-error') return 'NWS service error — try again later.'
    return 'No NWS coverage at this location.'
  }
  if (err instanceof NwsParseError) return 'NWS returned an unexpected response for this location.'
  return 'Something went wrong looking up this location.'
}

export function formatPointLoadingHtml(): string {
  return '<em>Loading forecast…</em>'
}

export function formatPointPopupHtml(content: PointPopupContent): string {
  const temperature = content.temperatureF === null ? '—' : `${content.temperatureF}°F`
  return [
    `<strong>${content.location}</strong>`,
    `${content.shortForecast} · ${temperature}`,
    `Wind: ${content.windSummary}`,
    `<span style="opacity: 0.7">Observed ${content.observedAt}</span>`,
  ].join('<br/>')
}

export function formatPointErrorHtml(message: string): string {
  return `<span>${message}</span>`
}
