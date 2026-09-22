import { describe, expect, it } from 'vitest'
import {
  GLOBE_PROJECTION,
  GLOBE_STYLE_URL,
  US_CENTER,
  US_ZOOM,
} from './globeConfig'

describe('globeConfig', () => {
  it('points at the OpenFreeMap dark style', () => {
    expect(GLOBE_STYLE_URL).toBe('https://tiles.openfreemap.org/styles/dark')
  })

  it('centers the initial camera on the continental US', () => {
    const [lng, lat] = US_CENTER
    expect(lng).toBeCloseTo(-98.5)
    expect(lat).toBeCloseTo(39.8)
    expect(US_ZOOM).toBeGreaterThan(0)
  })

  it('requests a globe projection', () => {
    expect(GLOBE_PROJECTION).toEqual({ type: 'globe' })
  })
})
