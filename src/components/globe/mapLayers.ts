// Small helpers for the layers MapLibreGlobe.tsx adds (#354): the visibility toggles and pointer
// cursors that every live layer repeats.

import type { Map as MapLibreMap } from 'maplibre-gl'

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
