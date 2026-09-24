import { describe, expect, it } from 'vitest'
import { describeGeolocationError, GEOLOCATE_POSITION_OPTIONS } from './geolocation'

describe('GEOLOCATE_POSITION_OPTIONS', () => {
  it('asks for a fresh, high-accuracy fix', () => {
    expect(GEOLOCATE_POSITION_OPTIONS.enableHighAccuracy).toBe(true)
    expect(GEOLOCATE_POSITION_OPTIONS.maximumAge).toBe(0)
  })
})

describe('describeGeolocationError', () => {
  it('explains a blocked permission and how to fix it', () => {
    expect(describeGeolocationError(1)).toMatch(/blocked.*browser settings/)
  })

  it('distinguishes an unavailable position from a timeout', () => {
    expect(describeGeolocationError(2)).toMatch(/not available/)
    expect(describeGeolocationError(3)).toMatch(/took too long/)
  })

  it('falls back to a generic message for an unknown code', () => {
    expect(describeGeolocationError(99)).toBe('Could not find your location.')
  })
})
