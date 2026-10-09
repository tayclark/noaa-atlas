// The imperative half of the wave overlay (#229): one canvas source on the MapLibre map, shaded by
// significant wave height once per field. All the maths is in waveField.ts; the canvas and the layer
// are the shared canvasShadingOverlay.ts.

import type { Map as MapLibreMap } from 'maplibre-gl'
import { createCanvasShadingOverlay, type CanvasShadingOverlay } from './canvasShadingOverlay'
import { renderWaveShading, type WaveFieldInput } from './waveField'

export const WAVE_SHADING_SOURCE_ID = 'wave-shading'
export const WAVE_SHADING_LAYER_ID = 'wave-shading-raster'

export type WaveOverlay = CanvasShadingOverlay<WaveFieldInput>

export function createWaveOverlay(map: MapLibreMap, beforeId?: string): WaveOverlay {
  return createCanvasShadingOverlay(
    map,
    { sourceId: WAVE_SHADING_SOURCE_ID, layerId: WAVE_SHADING_LAYER_ID, size: 1024, opacity: 0.85, render: (w, h, field) => renderWaveShading(w, h, field) },
    beforeId,
  )
}
