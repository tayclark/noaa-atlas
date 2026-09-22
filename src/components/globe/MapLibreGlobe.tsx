import { Map as MapLibreMap, Popup, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import './MapLibreGlobe.css'
import { getActiveAlerts } from '../../data/nwsClient'
import type { NwsAlertCollection } from '../../data/nwsSchema'
import {
  GLOBE_PROJECTION,
  GLOBE_STYLE_URL,
  US_CENTER,
  US_ZOOM,
} from './globeConfig'
import {
  alertSeverityColorExpression,
  describeAlertForPopup,
  splitAlertsByGeometry,
} from './nwsAlertsLayer'

const ALERTS_SOURCE_ID = 'nws-alerts'
const ALERTS_FILL_LAYER_ID = 'nws-alerts-fill'
const ALERTS_LINE_LAYER_ID = 'nws-alerts-line'

// Fly-to is out of scope for #38 (spike/globe-maplibre from the #82 engine spike has a
// reference if a later issue wants it).
export function MapLibreGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoneOnlyAlerts, setZoneOnlyAlerts] = useState<NwsAlertCollection['features']>([])

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: GLOBE_STYLE_URL,
      center: US_CENTER,
      zoom: US_ZOOM,
    })

    // setProjection must run after the style has finished loading, or
    // MapLibre throws "Style is not done loading."
    map.on('load', () => {
      map.setProjection(GLOBE_PROJECTION)

      getActiveAlerts()
        .then((alerts) => {
          const { mappable, zoneOnly } = splitAlertsByGeometry(alerts)
          setZoneOnlyAlerts(zoneOnly)

          map.addSource(ALERTS_SOURCE_ID, { type: 'geojson', data: mappable })
          map.addLayer({
            id: ALERTS_FILL_LAYER_ID,
            type: 'fill',
            source: ALERTS_SOURCE_ID,
            paint: {
              'fill-color': alertSeverityColorExpression(),
              'fill-opacity': 0.35,
            },
          })
          map.addLayer({
            id: ALERTS_LINE_LAYER_ID,
            type: 'line',
            source: ALERTS_SOURCE_ID,
            paint: {
              'line-color': alertSeverityColorExpression(),
              'line-width': 1.5,
            },
          })

          map.on('click', ALERTS_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
            const feature = e.features?.[0]
            const properties = feature?.properties
            if (!properties) return
            const { event, areaDesc, effective, expires } = describeAlertForPopup(
              properties as Parameters<typeof describeAlertForPopup>[0],
            )
            new Popup()
              .setLngLat(e.lngLat)
              .setHTML(
                `<strong>${event}</strong><br/>${areaDesc}<br/>${effective} – ${expires}`,
              )
              .addTo(map)
          })
          map.on('mouseenter', ALERTS_FILL_LAYER_ID, () => {
            map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', ALERTS_FILL_LAYER_ID, () => {
            map.getCanvas().style.cursor = ''
          })
        })
        .catch((err: unknown) => {
          // Full empty/error-state UI is #42; for now, don't let a failed alerts fetch break the globe.
          console.error('Failed to load NWS alerts', err)
        })
    })

    return () => map.remove()
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        role="img"
        aria-label="Globe view of NOAA API coverage"
        style={{ width: '100%', height: '100%' }}
      />
      {zoneOnlyAlerts.length > 0 && (
        <div className="zone-only-alerts" aria-label="Alerts without a mapped area">
          <strong>Zone alerts (no map location):</strong>
          <ul>
            {zoneOnlyAlerts.map((feature) => (
              <li key={feature.properties.id}>
                {feature.properties.event} — {feature.properties.areaDesc}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
