// @vitest-environment jsdom
import type { Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvasShadingOverlay } from './canvasShadingOverlay'

function stubMap() {
  return {
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => undefined),
    setLayoutProperty: vi.fn(),
    triggerRepaint: vi.fn(),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const options = { sourceId: 's', layerId: 'l', size: 4, opacity: 0.5, render: () => new Uint8ClampedArray(64) }

describe('createCanvasShadingOverlay', () => {
  it('adds a hidden canvas layer and shows or hides it', () => {
    const map = stubMap()
    const overlay = createCanvasShadingOverlay(map as unknown as MapLibreMap, options, 'above')
    expect(map.addSource).toHaveBeenCalledWith('s', expect.objectContaining({ type: 'canvas' }))
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'l', layout: { visibility: 'none' } }), 'above')
    overlay.setVisible(true)
    expect(map.setLayoutProperty).toHaveBeenCalledWith('l', 'visibility', 'visible')
  })

  it('touches the map no more once disposed (#354)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn() } as unknown as CanvasRenderingContext2D)
    const map = stubMap()
    const overlay = createCanvasShadingOverlay(map as unknown as MapLibreMap, options)
    overlay.setField(null)
    expect(map.triggerRepaint).toHaveBeenCalledTimes(1)
    overlay.dispose()
    overlay.setField(null)
    overlay.setVisible(true)
    expect(map.triggerRepaint).toHaveBeenCalledTimes(1)
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })
})
