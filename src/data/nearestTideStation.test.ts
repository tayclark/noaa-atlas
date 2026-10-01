import { describe, expect, it } from 'vitest'
import { distanceKm, nearestTideStation, tideStationFor } from './nearestTideStation'

describe('distanceKm', () => {
  it('is zero for the same point and about 111 km per degree of latitude', () => {
    expect(distanceKm([0, 0], [0, 0])).toBe(0)
    expect(distanceKm([0, 0], [0, 1])).toBeCloseTo(111.2, 0)
  })
})

describe('nearestTideStation', () => {
  const stations = [
    { id: 'far', lat: 10, lng: 10 },
    { id: 'near', lat: 0.1, lng: 0 },
  ]

  it('picks the closest station inside the limit', () => {
    expect(nearestTideStation(stations, [0, 0], 50)?.id).toBe('near')
  })

  it('returns null when none is close enough', () => {
    expect(nearestTideStation(stations, [0, 0], 5)).toBeNull()
    expect(nearestTideStation([], [0, 0], 50)).toBeNull()
  })
})

describe('tideStationFor', () => {
  it('finds a station for a point in a coastal harbour and none in Kansas', () => {
    expect(tideStationFor([-122.4, 37.8])).not.toBeNull()
    expect(tideStationFor([-95.7, 39.1])).toBeNull()
  })
})
