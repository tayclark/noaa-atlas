// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createWindOverlay } from './windOverlay'

function fakeMap() {
  const source = { play: vi.fn(), pause: vi.fn() }
  const map = {
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => source),
    setLayoutProperty: vi.fn(),
    triggerRepaint: vi.fn(),
  }
  return { map, source, asMap: map as unknown as MapLibreMap }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createWindOverlay', () => {
  it('shows its layers and starts the particles when made visible', () => {
    const { map, asMap } = fakeMap()
    const overlay = createWindOverlay(asMap, false)
    overlay.setVisible(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('wind-shading-raster', 'visibility', 'visible')
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('does nothing after it is disposed, as the map is going away (#354)', () => {
    const { map, asMap } = fakeMap()
    const overlay = createWindOverlay(asMap, false)
    overlay.setVisible(true)
    overlay.dispose()
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    vi.mocked(requestAnimationFrame).mockClear()
    map.setLayoutProperty.mockClear()
    map.getSource.mockClear()

    overlay.setVisible(true)
    overlay.setVisible(false)
    overlay.setPaused(false)
    overlay.setField(null)

    expect(map.setLayoutProperty).not.toHaveBeenCalled()
    expect(map.getSource).not.toHaveBeenCalled()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
})
