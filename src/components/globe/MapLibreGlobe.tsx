import { GeolocateControl, Map as MapLibreMap, Popup, type MapLayerMouseEvent, type MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
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
import { describeGeolocationError, GEOLOCATE_MAX_ZOOM, GEOLOCATE_POSITION_OPTIONS } from './geolocation'
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
  visibleZoneOnlyAlerts,
  zoneOnlyAlertsTitle,
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
import { describeNodeSelectionForGlobe } from './nodeSelectionStatus'
import { subscribeSelection, getSelectionSnapshot, selectPoint } from '../../data/selectionStore'

// Beyond this many zone-only alerts, the overlay collapses the rest behind a "N more" toggle
// rather than growing unbounded during a high-volume event (#106).
const ZONE_ONLY_ALERTS_CAP = 5

const ALERTS_SOURCE_ID = 'nws-alerts'
const ALERTS_FILL_LAYER_ID = 'nws-alerts-fill'
const ALERTS_LINE_LAYER_ID = 'nws-alerts-line'
const ALERTS_FILL_OPACITY = 0.35
const ALERTS_FILL_OPACITY_SELECTED = 0.6
const ALERTS_LINE_WIDTH = 1.5
const ALERTS_LINE_WIDTH_SELECTED = 3

// Parsed once at module scope — graph.json is small and static, so there's no need to
// re-validate it on every click (#41).
const graphNodes: ServiceNode[] = parseGraphFile(graphJson).nodes

/**
 * Point forecast/observation lookup (#39), shared by a globe click and the locate button. Coverage
 * is purely local (no network call), so it's computed up front and shown whether or not the NWS
 * lookup succeeds (#41).
 */
function showPointLookup(map: MapLibreMap, lng: number, lat: number) {
  const popup = new Popup().setLngLat([lng, lat]).setHTML(formatPointLoadingHtml()).addTo(map)
  const coverageHtml = formatCoveragePopupHtml(describeCoverageForPopup(nodesCoveringPoint(graphNodes, [lng, lat])))
  // Highlights the covering graph node(s) if/when the Graph tab is open (#45).
  selectPoint([lng, lat])

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
}

export function MapLibreGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [zoneOnlyAlerts, setZoneOnlyAlerts] = useState<NwsAlertCollection['features']>([])
  const [alertsStatus, setAlertsStatus] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')
  const [alertsErrorMessage, setAlertsErrorMessage] = useState<string | null>(null)
  const [zoneAlertsExpanded, setZoneAlertsExpanded] = useState(false)
  // Starts collapsed to its title bar (#151): a busy day lists hundreds of alerts, which covered
  // half the globe before the user had done anything.
  const [zoneAlertsCollapsed, setZoneAlertsCollapsed] = useState(true)
  const [geolocationError, setGeolocationError] = useState<string | null>(null)
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const selectedNode = selection.selectedNodeId
    ? graphNodes.find((n) => n.id === selection.selectedNodeId)
    : undefined
  const selectedNodeStatus = selectedNode ? describeNodeSelectionForGlobe(selectedNode) : null

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: GLOBE_STYLE_URL,
      center: US_CENTER,
      zoom: US_ZOOM,
    })
    mapRef.current = map

    const geolocate = new GeolocateControl({
      positionOptions: GEOLOCATE_POSITION_OPTIONS,
      fitBoundsOptions: { maxZoom: GEOLOCATE_MAX_ZOOM },
    })
    map.addControl(geolocate, 'top-right')
    // "Locate me" (the navigation-arrow button): the same lookup as a click, at the user's position.
    geolocate.on('geolocate', (e) => {
      setGeolocationError(null)
      showPointLookup(map, e.coords.longitude, e.coords.latitude)
    })
    geolocate.on('error', (e) => setGeolocationError(describeGeolocationError(e.code)))

    // setProjection must run after the style has finished loading, or
    // MapLibre throws "Style is not done loading."
    map.on('load', () => {
      map.setProjection(GLOBE_PROJECTION)
      setMapLoaded(true)

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
        showPointLookup(map, e.lngLat.lng, e.lngLat.lat)
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
              'fill-opacity': ALERTS_FILL_OPACITY,
            },
          })
          map.addLayer({
            id: ALERTS_LINE_LAYER_ID,
            type: 'line',
            source: ALERTS_SOURCE_ID,
            paint: {
              'line-color': alertSeverityColorExpression(),
              'line-width': ALERTS_LINE_WIDTH,
            },
          })

          map.on('click', ALERTS_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
            const feature = e.features?.[0]
            const properties = feature?.properties
            if (!properties) return
            const { event, areaDesc, effective, expires } = describeAlertForPopup(
              properties as Parameters<typeof describeAlertForPopup>[0],
            )
            // e.lngLat is guaranteed inside the clicked alert polygon (queryRenderedFeatures
            // matched it), so it's a valid representative point for coverage lookup (#45).
            selectPoint([e.lngLat.lng, e.lngLat.lat])
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

    return () => {
      mapRef.current = null
      map.remove()
    }
  }, [])

  // Reacts to a graph node selection (#44): flies to the node's coverage, highlights the
  // alerts layer when the node's live layer is the one being shown, and surfaces a status
  // overlay explaining why nothing highlights for a not-live node. Gated on mapLoaded since
  // fitBounds/setPaintProperty/getLayer all require a loaded style.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    if (map.getLayer(ALERTS_FILL_LAYER_ID)) {
      const highlighted = selectedNode?.liveLayer ?? false
      map.setPaintProperty(
        ALERTS_FILL_LAYER_ID,
        'fill-opacity',
        highlighted ? ALERTS_FILL_OPACITY_SELECTED : ALERTS_FILL_OPACITY,
      )
      map.setPaintProperty(
        ALERTS_LINE_LAYER_ID,
        'line-width',
        highlighted ? ALERTS_LINE_WIDTH_SELECTED : ALERTS_LINE_WIDTH,
      )
    }

    if (!selectedNode) return

    const [west, south, east, north] = describeNodeSelectionForGlobe(selectedNode).bounds
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 60, maxZoom: 8, essential: true },
    )
  }, [selectedNode, mapLoaded])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        role="img"
        aria-label="Globe view of NOAA API coverage"
        style={{ width: '100%', height: '100%' }}
      />
      {selectedNode && selectedNodeStatus && (
        <div className="node-selection-status" role="status" aria-label="Selected node status">
          <strong>{selectedNode.name}</strong>
          <p>{selectedNodeStatus.message}</p>
        </div>
      )}
      {geolocationError && (
        <div className="geolocation-status" role="status" aria-label="Location status">
          <p>{geolocationError}</p>
          <button type="button" aria-label="Dismiss" onClick={() => setGeolocationError(null)}>
            ×
          </button>
        </div>
      )}
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
      {alertsStatus === 'ok' && zoneOnlyAlerts.length > 0 && (() => {
        const { visible, hiddenCount } = visibleZoneOnlyAlerts(
          zoneOnlyAlerts,
          ZONE_ONLY_ALERTS_CAP,
          zoneAlertsExpanded,
        )
        return (
          <div className="zone-only-alerts" aria-label="Alerts without a mapped area">
            <div className="zone-only-alerts-header">
              <strong>{zoneOnlyAlertsTitle(zoneOnlyAlerts.length)}</strong>
              <button
                type="button"
                className="zone-only-alerts-collapse"
                aria-expanded={!zoneAlertsCollapsed}
                aria-label={zoneAlertsCollapsed ? 'Expand zone alerts' : 'Collapse zone alerts'}
                onClick={() => setZoneAlertsCollapsed((c) => !c)}
              >
                {zoneAlertsCollapsed ? '▸' : '▾'}
              </button>
            </div>
            {!zoneAlertsCollapsed && (
              <ul>
                {visible.map((feature) => (
                  <li key={feature.properties.id}>
                    {feature.properties.event} — {feature.properties.areaDesc}
                  </li>
                ))}
              </ul>
            )}
            {!zoneAlertsCollapsed && hiddenCount > 0 && (
              <button
                type="button"
                className="zone-only-alerts-toggle"
                onClick={() => setZoneAlertsExpanded(true)}
              >
                {hiddenCount} more
              </button>
            )}
            {!zoneAlertsCollapsed && zoneAlertsExpanded && zoneOnlyAlerts.length > ZONE_ONLY_ALERTS_CAP && (
              <button
                type="button"
                className="zone-only-alerts-toggle"
                onClick={() => setZoneAlertsExpanded(false)}
              >
                Show less
              </button>
            )}
          </div>
        )
      })()}
    </div>
  )
}
