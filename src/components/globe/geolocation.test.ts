import { describe, expect, it } from 'vitest'
import { describeGeolocationError, GEOLOCATE_POSITION_OPTIONS } from './geolocation'

describe('GEOLOCATE_POSITION_OPTIONS', () => {
  it('asks for a quick fix and accepts a recent one, since the answer is regional', () => {
    expect(GEOLOCATE_POSITION_OPTIONS.enableHighAccuracy).toBe(false)
    expect(GEOLOCATE_POSITION_OPTIONS.maximumAge).toBe(5 * 60_000)
    expect(GEOLOCATE_POSITION_OPTIONS.timeout).toBe(10_000)
  })
})

describe('describeGeolocationError', () => {
  it('explains a blocked permission and how to fix it', () => {
    expect(describeGeolocationError(1)).toMatch(/blocked.*browser settings/)
    expect(describeGeolocationError(1)).toMatch(/tap the map/)
  })

  it('distinguishes an unavailable position from a timeout', () => {
    expect(describeGeolocationError(2)).toMatch(/not available/)
    expect(describeGeolocationError(3)).toMatch(/took too long/)
  })

  it('falls back to a generic message for an unknown code', () => {
    expect(describeGeolocationError(99)).toBe('Could not find your location.')
  })
})
