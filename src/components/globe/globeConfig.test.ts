import { describe, expect, it } from 'vitest'
import {
  GLOBE_PROJECTION,
  GLOBE_STYLE_URL,
  openingZoom,
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

describe('openingZoom (#78)', () => {
  it('keeps the desktop zoom for a pane as wide as the desktop one, or wider', () => {
    // The pane beside the panel in a 1280px window is a little under 640px.
    expect(openingZoom(637)).toBe(US_ZOOM)
    expect(openingZoom(640)).toBe(US_ZOOM)
    expect(openingZoom(1200)).toBe(US_ZOOM)
  })

  it('zooms out on a phone, so the contiguous US fits across it', () => {
    const zoom = openingZoom(390)
    expect(zoom).toBeLessThan(US_ZOOM - 0.5)
    // At that zoom the 390px canvas spans about 62 degrees of longitude.
    const degrees = (390 * 360) / (512 * 2 ** zoom)
    expect(degrees).toBeCloseTo(62, 0)
  })

  it('zooms out further the narrower the container', () => {
    expect(openingZoom(320)).toBeLessThan(openingZoom(390))
    expect(openingZoom(390)).toBeLessThan(openingZoom(600))
  })

  it('never zooms out past a world-sized view', () => {
    expect(openingZoom(50)).toBe(1.5)
  })
})
