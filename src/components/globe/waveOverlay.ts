// The imperative half of the wave overlay (#229): one canvas source on the MapLibre map, shaded by
// significant wave height once per field. All the maths is in waveField.ts; this file only owns the
// canvas and the layer visibility. It is covered by e2e rather than unit tests, like windOverlay.ts.

import type { Map as MapLibreMap } from 'maplibre-gl'
import { AURORA_RASTER_COORDINATES } from './auroraLayer'
import { renderWaveShading, type WaveFieldInput } from './waveField'
import { pushCanvas } from './windOverlay'

export const WAVE_SHADING_SOURCE_ID = 'wave-shading'
export const WAVE_SHADING_LAYER_ID = 'wave-shading-raster'

const SHADING_SIZE = 1024

export interface WaveOverlay {
  setField: (field: WaveFieldInput | null) => void
  setVisible: (visible: boolean) => void
}

export function createWaveOverlay(map: MapLibreMap, beforeId?: string): WaveOverlay {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SHADING_SIZE
  map.addSource(WAVE_SHADING_SOURCE_ID, {
    type: 'canvas',
    canvas,
    coordinates: AURORA_RASTER_COORDINATES,
    animate: false,
  })
  map.addLayer(
    {
      id: WAVE_SHADING_LAYER_ID,
      type: 'raster',
      source: WAVE_SHADING_SOURCE_ID,
      layout: { visibility: 'none' },
      paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0, 'raster-opacity': 0.85 },
    },
    beforeId,
  )
  return {
    setField(field) {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (!field) {
        ctx.clearRect(0, 0, SHADING_SIZE, SHADING_SIZE)
      } else {
        const pixels = renderWaveShading(SHADING_SIZE, SHADING_SIZE, field)
        ctx.putImageData(new ImageData(pixels, SHADING_SIZE, SHADING_SIZE), 0, 0)
      }
      pushCanvas(map, WAVE_SHADING_SOURCE_ID)
    },
    setVisible(visible) {
      map.setLayoutProperty(WAVE_SHADING_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
    },
  }
}
