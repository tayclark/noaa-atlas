// Small helpers for the layers MapLibreGlobe.tsx adds (#354): a layer module's source and layers as
// one group, and the visibility toggles and pointer cursors that every live layer repeats.

import type { LayerSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { Map as MapLibreMap } from 'maplibre-gl'

/** A source and the layers drawn from it, bottom first, as a layer module describes them. */
export interface LayerGroup {
  sourceId: string
  source: Parameters<MapLibreMap['addSource']>[1]
  layers: LayerSpecification[]
}

/** Adds the group's source, then its layers in order, each under `beforeId` when given. */
export function addLayerGroup(map: MapLibreMap, { sourceId, source, layers }: LayerGroup, beforeId?: string): void {
  map.addSource(sourceId, source)
  for (const layer of layers) map.addLayer(layer, beforeId)
}

/** Shows or hides each of `ids`; a layer that isn't on the map is skipped. */
export function setLayersVisible(map: MapLibreMap, ids: readonly string[], visible: boolean): void {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
}

/** A pointer cursor while the mouse is over any of `ids`, which can be clicked. */
export function addPointerCursor(map: MapLibreMap, ids: readonly string[]): void {
  for (const id of ids) {
    map.on('mouseenter', id, () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', id, () => {
      map.getCanvas().style.cursor = ''
    })
  }
}
