// A canvas source on the MapLibre map that shades a GFS field over the whole globe (#229, #340),
// redrawn once per field. Shared by the wave and simulated radar overlays: each supplies its ids and
// how to render. Covered by e2e rather than unit tests, like windOverlay.ts.

import type { Map as MapLibreMap } from 'maplibre-gl'
import { AURORA_RASTER_COORDINATES } from './auroraLayer'
import { pushCanvas } from './windOverlay'

export interface CanvasShadingOverlay<F> {
  setField: (field: F | null) => void
  setVisible: (visible: boolean) => void
}

export interface CanvasShadingOptions<F> {
  sourceId: string
  layerId: string
  /** Canvas width and height in pixels. */
  size: number
  opacity: number
  render: (width: number, height: number, field: F) => Uint8ClampedArray<ArrayBuffer>
}

export function createCanvasShadingOverlay<F>(map: MapLibreMap, options: CanvasShadingOptions<F>, beforeId?: string): CanvasShadingOverlay<F> {
  const { sourceId, layerId, size, opacity, render } = options
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  map.addSource(sourceId, { type: 'canvas', canvas, coordinates: AURORA_RASTER_COORDINATES, animate: false })
  map.addLayer(
    {
      id: layerId,
      type: 'raster',
      source: sourceId,
      layout: { visibility: 'none' },
      paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0, 'raster-opacity': opacity },
    },
    beforeId,
  )
  return {
    setField(field) {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (!field) ctx.clearRect(0, 0, size, size)
      else ctx.putImageData(new ImageData(render(size, size, field), size, size), 0, 0)
      pushCanvas(map, sourceId)
    },
    setVisible(visible) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    },
  }
}
