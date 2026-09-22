// Spike-only (#82): throwaway prototype, not the real globe implementation.
import { Map as MapLibreMap, Popup, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import {
  fetchActiveAlerts,
  type AlertGeometry,
  type NwsAlertFeature,
} from '../../data/nwsAlerts'

const US_CENTER: [number, number] = [-98.5, 39.8]
const US_ZOOM = 3

export function MapLibreGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [flyToTarget, setFlyToTarget] = useState<NwsAlertFeature | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: US_CENTER,
      zoom: US_ZOOM,
    })
    mapRef.current = map

    map.on('load', () => {
      map.setProjection({ type: 'globe' })

      fetchActiveAlerts()
        .then((alerts) => {
          map.addSource('nws-alerts', { type: 'geojson', data: alerts })
          map.addLayer({
            id: 'nws-alerts-fill',
            type: 'fill',
            source: 'nws-alerts',
            paint: { 'fill-color': '#ff6b6b', 'fill-opacity': 0.35 },
          })
          map.addLayer({
            id: 'nws-alerts-line',
            type: 'line',
            source: 'nws-alerts',
            paint: { 'line-color': '#ff6b6b', 'line-width': 1.5 },
          })

          if (alerts.features.length > 0) {
            setFlyToTarget(alerts.features[0])
          }

          map.on('click', 'nws-alerts-fill', (e: MapLayerMouseEvent) => {
            const feature = e.features?.[0]
            if (!feature) return
            new Popup()
              .setLngLat(e.lngLat)
              .setHTML(
                `<strong>${feature.properties?.event}</strong><br/>${feature.properties?.headline ?? ''}`,
              )
              .addTo(map)
          })
          map.on(
            'mouseenter',
            'nws-alerts-fill',
            () => (map.getCanvas().style.cursor = 'pointer'),
          )
          map.on(
            'mouseleave',
            'nws-alerts-fill',
            () => (map.getCanvas().style.cursor = ''),
          )
        })
        .catch((err: unknown) => console.error('Failed to load NWS alerts', err))
    })

    return () => map.remove()
  }, [])

  const handleFlyTo = () => {
    const map = mapRef.current
    if (!map || !flyToTarget?.geometry) return
    const centroid = geometryCentroid(flyToTarget.geometry)
    if (!centroid) return
    map.flyTo({ center: centroid, zoom: 6, essential: true })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {flyToTarget && (
        <button
          onClick={handleFlyTo}
          style={{ position: 'absolute', top: 12, left: 12, zIndex: 1 }}
        >
          Fly to: {flyToTarget.properties.event}
        </button>
      )}
    </div>
  )
}

function geometryCentroid(geometry: AlertGeometry): [number, number] | null {
  const coords: [number, number][] = []
  if (geometry.type === 'Polygon') {
    geometry.coordinates[0]?.forEach((c) => coords.push([c[0], c[1]]))
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates[0]?.[0]?.forEach((c) => coords.push([c[0], c[1]]))
  }
  if (coords.length === 0) return null
  const [sumLng, sumLat] = coords.reduce(
    ([lng, lat], [cLng, cLat]) => [lng + cLng, lat + cLat],
    [0, 0],
  )
  return [sumLng / coords.length, sumLat / coords.length]
}
