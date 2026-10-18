// A buoy list the globe loads the first time its node is shown (#269), like DART and NDBC: the
// layer is shown or hidden with `shown`, the list is read once into the source, and a failed load is
// forgotten once the layer is hidden, so the next select tries again (#354). Returns the station
// count, 'error', or null before a load has finished.

import { useEffect, useState, type RefObject } from 'react'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { setLayersVisible } from './mapLayers'

export type StationLoad = number | 'error' | null

export function useLazyStationLayer<S>(
  mapRef: RefObject<MapLibreMap | null>,
  mapLoaded: boolean,
  shown: boolean,
  layerId: string,
  sourceId: string,
  load: () => Promise<S[]>,
  toGeoJSON: (stations: S[]) => Parameters<GeoJSONSource['setData']>[0],
): StationLoad {
  const [count, setCount] = useState<StationLoad>(null)
  if (!shown && count === 'error') setCount(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    setLayersVisible(map, [layerId], shown)
    if (!shown || count !== null) return
    let cancelled = false
    load().then(
      (stations) => {
        if (cancelled) return
        map.getSource<GeoJSONSource>(sourceId)?.setData(toGeoJSON(stations))
        setCount(stations.length)
      },
      () => {
        if (!cancelled) setCount('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [mapRef, mapLoaded, shown, count, layerId, sourceId, load, toGeoJSON])
  return count
}
