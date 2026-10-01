// Which CO-OPS tide station a forecast point should borrow its tide curve from (#228).

import type { LonLat } from './coverageLookup'
import { COOPS_STATIONS } from './coopsStations'

type Located = { lat: number; lng: number }

const EARTH_RADIUS_KM = 6371

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LonLat, b: LonLat): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** The closest station within `maxKm` of the point, or null (an inland point has no tide). */
export function nearestTideStation<T extends Located>(stations: readonly T[], point: LonLat, maxKm: number): T | null {
  let best: T | null = null
  let bestKm = maxKm
  for (const station of stations) {
    const km = distanceKm(point, [station.lng, station.lat])
    if (km <= bestKm) {
      best = station
      bestKm = km
    }
  }
  return best
}

/** How far a tide curve is still a fair picture of the water at the point. */
export const TIDE_STATION_MAX_KM = 40

export const tideStationFor = (point: LonLat) => nearestTideStation(COOPS_STATIONS, point, TIDE_STATION_MAX_KM)
