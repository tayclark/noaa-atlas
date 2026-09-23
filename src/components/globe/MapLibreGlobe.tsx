import { Map as MapLibreMap, Popup, type MapLayerMouseEvent, type MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import './MapLibreGlobe.css'
import {
  getActiveAlerts,
  getGridpointForecast,
  getLatestObservation,
  getPoint,
  getStations,
} from '../../data/nwsClient'
import graphJson from '../../data/graph.json'
import { parseGraphFile, type ServiceNode } from '../../data/graphSchema'
import type { NwsAlertCollection } from '../../data/nwsSchema'
import { describeCoverageForPopup, formatCoveragePopupHtml } from './coveragePopup'
import {
  GLOBE_PROJECTION,
  GLOBE_STYLE_URL,
  US_CENTER,
  US_ZOOM,
} from './globeConfig'
import {
  alertSeverityColorExpression,
  describeAlertForPopup,
  describeAlertsFetchOutcome,
  splitAlertsByGeometry,
} from './nwsAlertsLayer'
import {
  describePointError,
  describePointForPopup,
  formatPointErrorHtml,
  formatPointLoadingHtml,
  formatPointPopupHtml,
  pickNearestStation,
} from './nwsPointLookup'
import { nodesCoveringPoint } from '../../data/coverageLookup'

const ALERTS_SOURCE_ID = 'nws-alerts'
const ALERTS_FILL_LAYER_ID = 'nws-alerts-fill'
const ALERTS_LINE_LAYER_ID = 'nws-alerts-line'

// Parsed once at module scope — graph.json is small and static, so there's no need to
// re-validate it on every click (#41).
const graphNodes: ServiceNode[] = parseGraphFile(graphJson).nodes

// Fly-to is out of scope for #38 (spike/globe-maplibre from the #82 engine spike has a
// reference if a later issue wants it).
export function MapLibreGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoneOnlyAlerts, setZoneOnlyAlerts] = useState<NwsAlertCollection['features']>([])
  const [alertsStatus, setAlertsStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [alertsErrorMessage, setAlertsErrorMessage] = useState<string | null>(null)

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

      // Point-click forecast/observation lookup (#39). Registered as a global click handler,
      // not layer-scoped like the alerts click handler below, so it works immediately without
      // waiting on the alerts fetch. Guarded so a click on an alert polygon is handled only by
      // the alert popup below, not both — map.getLayer(...) also guards queryRenderedFeatures
      // being called before the alerts layer exists.
      map.on('click', (e: MapMouseEvent) => {
        const alertFeatures = map.getLayer(ALERTS_FILL_LAYER_ID)
          ? map.queryRenderedFeatures(e.point, { layers: [ALERTS_FILL_LAYER_ID] })
          : []
        if (alertFeatures.length > 0) return

        const { lat, lng } = e.lngLat
        const popup = new Popup().setLngLat(e.lngLat).setHTML(formatPointLoadingHtml()).addTo(map)

        // Coverage is purely local (no network call), so it's computed once up front and shown
        // regardless of whether the NWS forecast/observation lookup below succeeds (#41).
        const coverageHtml = formatCoveragePopupHtml(
          describeCoverageForPopup(nodesCoveringPoint(graphNodes, [lng, lat])),
        )

        getPoint(lat, lng)
          .then((point) =>
            Promise.all([
              getGridpointForecast(point.properties.gridId, point.properties.gridX, point.properties.gridY),
              getStations(point.properties.gridId, point.properties.gridX, point.properties.gridY),
            ]).then(([forecast, stations]) => {
              const nearest = pickNearestStation(stations, lat, lng)
              if (!nearest) throw new Error('No observation stations found near this location')
              return getLatestObservation(nearest.properties.stationIdentifier).then((observation) => {
                const period = forecast.properties.periods[0]
                if (!period) throw new Error('No forecast periods returned for this location')
                popup.setHTML(`${formatPointPopupHtml(describePointForPopup(period, observation))}<hr/>${coverageHtml}`)
              })
            }),
          )
          .catch((err: unknown) => {
            popup.setHTML(`${formatPointErrorHtml(describePointError(err))}<hr/>${coverageHtml}`)
          })
      })

      getActiveAlerts()
        .then((alerts) => {
          const { mappable, zoneOnly } = splitAlertsByGeometry(alerts)
          setZoneOnlyAlerts(zoneOnly)
          setAlertsStatus(mappable.features.length === 0 && zoneOnly.length === 0 ? 'empty' : 'ok')

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
          setAlertsStatus('error')
          setAlertsErrorMessage(describeAlertsFetchOutcome(err))
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
      {alertsStatus === 'error' && (
        <div className="zone-only-alerts" role="status" aria-label="Alerts status">
          {alertsErrorMessage}
        </div>
      )}
      {alertsStatus === 'empty' && (
        <div className="zone-only-alerts" role="status" aria-label="Alerts status">
          No active alerts.
        </div>
      )}
      {alertsStatus === 'ok' && zoneOnlyAlerts.length > 0 && (
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
