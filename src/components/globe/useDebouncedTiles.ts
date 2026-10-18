// Points a raster source at the tile URL of the chosen frame (#74, #338), debounced so dragging the
// time slider doesn't refetch tiles for every frame it passes over. `url` is null while the layer
// isn't wanted, which leaves the source as it is.

import { useEffect, useRef, type RefObject } from 'react'
import type { Map as MapLibreMap, RasterTileSource } from 'maplibre-gl'

export const TILE_DEBOUNCE_MS = 150

export function useDebouncedTiles(
  mapRef: RefObject<MapLibreMap | null>,
  mapLoaded: boolean,
  sourceId: string,
  initialUrl: string,
  url: string | null,
): void {
  const appliedRef = useRef(initialUrl)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || url === null || url === appliedRef.current) return
    const timer = setTimeout(() => {
      ;(map.getSource(sourceId) as RasterTileSource | undefined)?.setTiles([url])
      appliedRef.current = url
    }, TILE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [mapRef, mapLoaded, sourceId, url])
}
