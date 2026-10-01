import { GeolocateControl, LngLat, Map as MapLibreMap, Marker, Popup, setWorkerUrl, type CanvasSource, type ExpressionSpecification, type GeoJSONSource, type LngLatLike, type MapGeoJSONFeature, type MapMouseEvent, type PopupOptions, type RasterTileSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
import { pollWhileVisible } from '../../data/pollWhileVisible'
import { getHiloPredictions, getWaterLevel } from '../../data/coopsClient'
import { COOPS_STATIONS } from '../../data/coopsStations'
import { DART_STATIONS } from '../../data/dartStations'
import { NDBC_STATIONS } from '../../data/ndbcStations'
import { getOvationAurora, getPlanetaryKp, SWPC_REFRESH_MS } from '../../data/swpcClient'
import type { SwpcOvation } from '../../data/swpcSchema'
import {
  COOPS_MIN_ZOOM,
  formatStationLoadingHtml,
  formatStationPopupHtml,
  stationsToGeoJSON,
  type StationProperties,
} from './coopsStationsLayer'
import { dartStationsToGeoJSON, formatDartPopupHtml, type DartProperties } from './dartStationsLayer'
import { ndbcStationsToGeoJSON, formatNdbcPopupHtml, type NdbcProperties } from './ndbcStationsLayer'
import {
  AURORA_RASTER_COORDINATES,
  auroraAt,
  auroraRaster,
  describeSwpcFetchOutcome,
  formatAuroraPopupHtml,
} from './auroraLayer'
import { prefersReducedMotion } from '../prefersReducedMotion'
import { describeKp, type KpReadout } from './kpReadout'
import {
  NOWCOAST_RADAR_ATTRIBUTION,
  NOWCOAST_RADAR_OPACITY,
  NOWCOAST_RADAR_TILE_SIZE,
  NOWCOAST_RADAR_TILE_URL,
  radarTileUrl,
} from './nowcoastRadarLayer'
import { RadarTimeControl } from './RadarTimeControl'
import { NOWCOAST_CAPABILITIES_URL, parseRadarFrames } from './radarTimes'
import { describeCoverageForPopup, formatCoveragePopupHtml } from './coveragePopup'
import { hitBox, hitPadding, nearestCandidate } from './hitPick'
import { describeGeolocationError, GEOLOCATE_MAX_ZOOM, GEOLOCATE_POSITION_OPTIONS } from './geolocation'
import {
  GLOBE_PROJECTION,
  GLOBE_STYLE_URL,
  openingZoom,
  US_CENTER,
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
import { parseTasksFile } from '../../data/taskSchema'
import tasksJson from '../../data/tasks.json'
import { describeSelectionForGlobe, type GlobeViewContext } from './selectionGlobeView'
import { subscribeSelection, getSelectionSnapshot, selectPoint } from '../../data/selectionStore'

// `vite build` doesn't discover maplibre's worker on its own; the `maplibreWorker` plugin in
// vite.config.ts emits it under `maplibre/`. The dev server needs no help (#49).
if (!import.meta.env.DEV) setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`)

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

// The selection's coverage footprint (#149), drawn under the alerts in each service's theme colour.
const COVERAGE_SOURCE_ID = 'selected-coverage'
const COVERAGE_FILL_LAYER_ID = 'selected-coverage-fill'
const COVERAGE_LINE_LAYER_ID = 'selected-coverage-line'
// Matches the `@container globe (max-width: 480px)` rules in MapLibreGlobe.css (#159).
const NARROW_GLOBE_WIDTH = 480
// The US outlines are derived from Natural Earth (public domain) and the Marine Regions EEZ, and the
// ocean basins from Marine Regions' Global Oceans and Seas; their CC BY 4.0 licence asks for credit
// wherever they're shown (#163, #170).
const COVERAGE_ATTRIBUTION =
  'Coverage: <a href="https://www.naturalearthdata.com/">Natural Earth</a>, <a href="https://www.marineregions.org/">Marine Regions</a> (CC BY 4.0)'
// The SWPC aurora forecast (#54, #158), a raster drawn under the alerts and brightened when selected.
const AURORA_SOURCE_ID = 'swpc-aurora'
const AURORA_LAYER_ID = 'swpc-aurora-raster'
const AURORA_OPACITY = 0.75
const AURORA_OPACITY_SELECTED = 1

// The nowCOAST radar tiles (#56): a WMS raster that MapLibre fetches itself, hidden until the
// nowCOAST node is selected so nothing is requested on load.
const RADAR_SOURCE_ID = 'nowcoast-radar'
const RADAR_FRAMES_REFRESH_MS = 5 * 60_000
const RADAR_FRAME_DEBOUNCE_MS = 150
const RADAR_LAYER_ID = 'nowcoast-radar-raster'

// The CO-OPS tide stations (#51): static points from coopsStations.json, drawn from regional zoom
// (COOPS_MIN_ZOOM) and enlarged when the CO-OPS Data API node is selected. Their water level and
// predictions are fetched on click.
const COOPS_SOURCE_ID = 'coops-stations'
const COOPS_LAYER_ID = 'coops-stations-circle'
const COOPS_RADIUS: [number, number][] = [
  [COOPS_MIN_ZOOM, 3],
  [8, 6],
]
const COOPS_RADIUS_SELECTED = COOPS_RADIUS.map(([zoom, radius]): [number, number] => [zoom, radius + 2])
// The DART tsunami buoys (#80): a static snapshot, worldwide, drawn only while the NDBC DART node
// is selected.
const DART_SOURCE_ID = 'dart-stations'
const DART_LAYER_ID = 'dart-stations-circle'
// The NDBC moored buoys: a static snapshot too, since NDBC sends no CORS headers. Drawn only while
// the NDBC realtime node is selected.
const NDBC_SOURCE_ID = 'ndbc-stations'
const NDBC_LAYER_ID = 'ndbc-stations-circle'
const coopsRadius = (stops: [number, number][]) =>
  ['interpolate', ['linear'], ['zoom'], ...stops.flat()] as ExpressionSpecification

// Worldwide coverage tints the whole globe, so the default view is kept rather than framing the world.
const GLOBAL_VIEW_ZOOM = 1.5

// Parsed once at module scope — graph.json is small and static, so there's no need to
// re-validate it on every click (#41).
const graphNodes: ServiceNode[] = parseGraphFile(graphJson).nodes
const globeViewContext: GlobeViewContext = {
  nodes: graphNodes,
  tasks: parseTasksFile(tasksJson).tasks,
  nodesAtPoint: (point) => nodesCoveringPoint(graphNodes, point),
}

// One popup at a time (#78): a station inside an alert, or a second tap, used to stack them. It is
// at most 320px wide, and less on a screen that is narrower than that.
const POPUP_MAX_WIDTH = 'min(320px, calc(100vw - 32px))'
// How far (px) a narrow globe's popup stands off the tapped point.
const POPUP_POINT_GAP = 14
let openPopup: Popup | null = null
function showPopup(map: MapLibreMap, lngLat: LngLatLike, html: string): Popup {
  openPopup?.remove()
  const placement = popupPlacement(map, lngLat)
  const popup = new Popup({ maxWidth: POPUP_MAX_WIDTH, ...placement }).setLngLat(lngLat).setHTML(html).addTo(map)
  // A popup that spans the globe stands off the point, so a ring marks where was tapped.
  if (placement.className) {
    const ring = document.createElement('div')
    ring.className = 'globe-tap-ring'
    const marker = new Marker({ element: ring }).setLngLat(lngLat).addTo(map)
    popup.on('close', () => marker.remove())
  }
  openPopup = popup
  popup.on('close', () => {
    if (openPopup === popup) openPopup = null
  })
  return popup
}

/**
 * On a narrow globe the popup spans its width (see the CSS), above the tapped point in the lower
 * half of the map and below it in the upper half, so it never runs off an edge. MapLibre's own
 * placement assumes a map at least twice as wide as the popup and leaves one clipped on a phone.
 */
function popupPlacement(map: MapLibreMap, lngLat: LngLatLike): Partial<PopupOptions> {
  const container = map.getContainer()
  if (container.clientWidth > NARROW_GLOBE_WIDTH) return {}
  const point = map.project(LngLat.convert(lngLat))
  const below = point.y > container.clientHeight / 2
  return {
    anchor: below ? 'bottom' : 'top',
    offset: [container.clientWidth / 2 - point.x, below ? -POPUP_POINT_GAP : POPUP_POINT_GAP],
    className: 'globe-popup-narrow',
  }
}

// The second click of a double-tap zoom is not another question for the forecast service (#78).
const DOUBLE_CLICK_MS = 350
const STATION_LAYER_IDS = [COOPS_LAYER_ID, DART_LAYER_ID, NDBC_LAYER_ID]

/**
 * Point forecast/observation lookup (#39), shared by a globe click and the locate button. Coverage
 * is purely local (no network call), so it's computed up front and shown whether or not the NWS
 * lookup succeeds (#41).
 */
function showPointLookup(map: MapLibreMap, lng: number, lat: number, ovation: SwpcOvation | null) {
  // The aurora chance here (#54), when the forecast has loaded and this cell has any.
  const aurora = ovation ? auroraAt(ovation, [lng, lat]) : null
  const auroraHtml = ovation && aurora !== null ? `${formatAuroraPopupHtml(aurora, ovation.forecastTime)}<hr/>` : ''
  const coverageHtml = auroraHtml + formatCoveragePopupHtml(describeCoverageForPopup(nodesCoveringPoint(graphNodes, [lng, lat])))
  // Coverage is local, so it is there at once, under the forecast that is still loading (#78).
  const popup = showPopup(map, [lng, lat], `${formatPointLoadingHtml()}<hr/>${coverageHtml}`)
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

/** The popup for a tapped station, by the layer it belongs to; each also selects the point (#45, #51). */
function openStationPopup(map: MapLibreMap, feature: MapGeoJSONFeature) {
  if (feature.geometry.type !== 'Point') return
  const [lng, lat] = feature.geometry.coordinates
  selectPoint([lng, lat])
  if (feature.layer.id === COOPS_LAYER_ID) {
    const station = feature.properties as StationProperties
    const popup = showPopup(map, [lng, lat], formatStationLoadingHtml(station))
    void Promise.allSettled([getWaterLevel(station.id), getHiloPredictions(station.id)]).then(([water, tides]) => {
      popup.setHTML(formatStationPopupHtml(station, water, tides))
    })
  } else if (feature.layer.id === DART_LAYER_ID) {
    showPopup(map, [lng, lat], formatDartPopupHtml(feature.properties as DartProperties))
  } else {
    showPopup(map, [lng, lat], formatNdbcPopupHtml(feature.properties as NdbcProperties))
  }
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
  // Space weather (#54). The grid is kept for click lookups; the cell count also tells the
  // selection effect the aurora layer now exists.
  const ovationRef = useRef<SwpcOvation | null>(null)
  const [auroraCells, setAuroraCells] = useState<number | null>(null)
  const [auroraError, setAuroraError] = useState<string | null>(null)
  const [kp, setKp] = useState<{ status: 'loading' } | { status: 'ok'; readout: KpReadout } | { status: 'error'; message: string }>({
    status: 'loading',
  })
  // Radar time (#74): the frame list and the chosen frame (null follows the latest one).
  const [radarFrames, setRadarFrames] = useState<string[]>([])
  const [radarTime, setRadarTime] = useState<string | null>(null)
  const radarUrlRef = useRef(NOWCOAST_RADAR_TILE_URL)
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const view = useMemo(() => describeSelectionForGlobe(selection, globeViewContext), [selection])
  // A tap on the globe selects a point, which replaces the service whose radar or buoys were on
  // screen, and with them goes the layer the reader was looking at, even when the tap was on one
  // of its own buoys (#78). The layers stay while a point is selected.
  const [heldLayers, setHeldLayers] = useState(view.liveLayers)
  if (!selection.selectedPoint && heldLayers !== view.liveLayers) setHeldLayers(view.liveLayers)
  const liveLayers = selection.selectedPoint ? heldLayers : view.liveLayers
  const geolocateRef = useRef<GeolocateControl | null>(null)
  const [locating, setLocating] = useState(false)
  // MapLibre enables its own button once it knows the browser can geolocate; ours waits for that.
  const [locateReady, setLocateReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: GLOBE_STYLE_URL,
      center: US_CENTER,
      // The desktop zoom shows a phone's screen only a third of the US (#78).
      zoom: openingZoom(containerRef.current.clientWidth),
      // Two fingers zoom and pan the globe, but don't tilt or twist it (#78): with no compass, a
      // globe turned by an accidental twist has no way back to north.
      touchPitch: false,
      // A phone draws every pixel at 3x, which costs battery for a basemap that looks the same at 2x.
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    })
    map.touchZoomRotate.disableRotation()
    mapRef.current = map
    let stopSwpcPolling: (() => void) | null = null

    // "Locate me": the same lookup as a click, at the user's position. MapLibre's control does the
    // positioning, the camera and the user's dot; its own icon-only button is hidden (see the CSS)
    // in favour of a labelled one of ours, which can show that a fix is being waited for (#78).
    const geolocate = new GeolocateControl({
      positionOptions: GEOLOCATE_POSITION_OPTIONS,
      fitBoundsOptions: { maxZoom: GEOLOCATE_MAX_ZOOM },
    })
    map.addControl(geolocate, 'top-right')
    geolocateRef.current = geolocate
    const mapContainer = containerRef.current
    const nativeLocateButton = () => mapContainer.querySelector<HTMLButtonElement>('.maplibregl-ctrl-geolocate')
    const readyObserver = new MutationObserver(() => {
      if (nativeLocateButton()?.disabled === false) {
        setLocateReady(true)
        readyObserver.disconnect()
      }
    })
    readyObserver.observe(mapContainer, { attributes: true, subtree: true, childList: true, attributeFilter: ['disabled'] })
    geolocate.on('geolocate', (e) => {
      setLocating(false)
      setGeolocationError(null)
      showPointLookup(map, e.coords.longitude, e.coords.latitude, ovationRef.current)
    })
    geolocate.on('error', (e) => {
      setLocating(false)
      setGeolocationError(describeGeolocationError(e.code))
    })

    // setProjection must run after the style has finished loading, or
    // MapLibre throws "Style is not done loading."
    map.on('load', () => {
      map.setProjection(GLOBE_PROJECTION)
      // In a narrow map MapLibre makes the attribution compact but opens it until the first drag,
      // covering the bottom of the globe on a phone (#159). There, start it folded to its ⓘ button;
      // a desktop pane (640px at 1280 wide) keeps it open where there's room for it.
      const container = containerRef.current
      if (container && container.clientWidth <= NARROW_GLOBE_WIDTH) {
        container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      }
      map.addSource(COVERAGE_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: COVERAGE_ATTRIBUTION })
      map.addLayer({
        id: COVERAGE_FILL_LAYER_ID,
        type: 'fill',
        source: COVERAGE_SOURCE_ID,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 },
      })
      map.addLayer({
        id: COVERAGE_LINE_LAYER_ID,
        type: 'line',
        source: COVERAGE_SOURCE_ID,
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 },
      })
      // Radar sits under the stations and the alerts. Hidden layers fetch no tiles.
      map.addSource(RADAR_SOURCE_ID, {
        type: 'raster',
        tiles: [NOWCOAST_RADAR_TILE_URL],
        tileSize: NOWCOAST_RADAR_TILE_SIZE,
        attribution: NOWCOAST_RADAR_ATTRIBUTION,
      })
      map.addLayer({
        id: RADAR_LAYER_ID,
        type: 'raster',
        source: RADAR_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': NOWCOAST_RADAR_OPACITY, 'raster-fade-duration': 0 },
      })
      // Under the alerts, which are added later. Stations are static, so the layer needs no fetch.
      map.addSource(COOPS_SOURCE_ID, { type: 'geojson', data: stationsToGeoJSON(COOPS_STATIONS) })
      map.addLayer({
        id: COOPS_LAYER_ID,
        type: 'circle',
        source: COOPS_SOURCE_ID,
        minzoom: COOPS_MIN_ZOOM,
        paint: {
          'circle-color': '#0b6fb8',
          'circle-radius': coopsRadius(COOPS_RADIUS),
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })
      map.on('mouseenter', COOPS_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', COOPS_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.addSource(DART_SOURCE_ID, { type: 'geojson', data: dartStationsToGeoJSON(DART_STATIONS) })
      map.addLayer({
        id: DART_LAYER_ID,
        type: 'circle',
        source: DART_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: {
          'circle-color': '#c2410c',
          'circle-radius': 5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      })
      map.on('mouseenter', DART_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', DART_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.addSource(NDBC_SOURCE_ID, { type: 'geojson', data: ndbcStationsToGeoJSON(NDBC_STATIONS) })
      map.addLayer({
        id: NDBC_LAYER_ID,
        type: 'circle',
        source: NDBC_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: {
          'circle-color': '#0f766e',
          'circle-radius': 4,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      })
      map.on('mouseenter', NDBC_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', NDBC_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      setMapLoaded(true)

      // Every tap or click on the map (#39, #51, #78). One handler decides what it meant, so only one
      // popup opens: a station if one is near (a fingertip can't aim at a 6px dot, so the query is a
      // padded box and the nearest dot wins), else an alert polygon under the point, else a
      // forecast and coverage lookup there. Layers that aren't drawn yet are skipped.
      let lastClickAt = -Infinity
      map.on('click', (e: MapMouseEvent) => {
        const at = e.originalEvent.timeStamp
        const isEcho = at - lastClickAt < DOUBLE_CLICK_MS
        lastClickAt = at
        if (isEcho) return

        const stationLayers = STATION_LAYER_IDS.filter((id) => map.getLayer(id))
        const padding = hitPadding(window.matchMedia?.('(pointer: coarse)').matches ?? false)
        const nearby = stationLayers.length > 0 ? map.queryRenderedFeatures(hitBox(e.point, padding), { layers: stationLayers }) : []
        const station = nearestCandidate(
          nearby.flatMap((feature) => (feature.geometry.type === 'Point' ? [{ feature, ...map.project(feature.geometry.coordinates as [number, number]) }] : [])),
          e.point,
        )
        if (station) return openStationPopup(map, station)

        const alert = map.getLayer(ALERTS_FILL_LAYER_ID) ? map.queryRenderedFeatures(e.point, { layers: [ALERTS_FILL_LAYER_ID] })[0] : undefined
        if (alert?.properties) {
          const { event, areaDesc, effective, expires } = describeAlertForPopup(alert.properties as Parameters<typeof describeAlertForPopup>[0])
          // e.lngLat is guaranteed inside the polygon (queryRenderedFeatures matched it), so it's a
          // valid representative point for coverage lookup (#45).
          selectPoint([e.lngLat.lng, e.lngLat.lat])
          showPopup(map, e.lngLat, `<strong>${event}</strong><br/>${areaDesc}<br/>${effective} – ${expires}`)
          return
        }

        showPointLookup(map, e.lngLat.lng, e.lngLat.lat, ovationRef.current)
      })

      // Both files are re-fetched every few minutes while the tab is visible. A failed refresh
      // keeps what is already on screen; only a failed first load shows an error.
      let auroraCanvas: HTMLCanvasElement | null = null
      let kpLoaded = false

      const loadAurora = () =>
        getOvationAurora()
          .then((ovation) => {
            ovationRef.current = ovation
            const raster = auroraRaster(ovation)
            if (!auroraCanvas) {
              auroraCanvas = document.createElement('canvas')
              auroraCanvas.width = raster.width
              auroraCanvas.height = raster.height
              auroraCanvas.getContext('2d')?.putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0)
              map.addSource(AURORA_SOURCE_ID, { type: 'canvas', canvas: auroraCanvas, coordinates: AURORA_RASTER_COORDINATES, animate: false })
              // Under the alerts if they're already drawn; if they arrive later they're added on top anyway.
              map.addLayer(
                {
                  id: AURORA_LAYER_ID,
                  type: 'raster',
                  source: AURORA_SOURCE_ID,
                  paint: { 'raster-opacity': AURORA_OPACITY, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
                },
                map.getLayer(ALERTS_FILL_LAYER_ID) ? ALERTS_FILL_LAYER_ID : undefined,
              )
            } else {
              auroraCanvas.getContext('2d')?.putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0)
              // A non-animated canvas source only uploads its texture on load; play() then pause()
              // uploads the redrawn canvas once.
              const source = map.getSource(AURORA_SOURCE_ID) as CanvasSource | undefined
              source?.play()
              source?.pause()
              map.triggerRepaint()
            }
            setAuroraError(null)
            setAuroraCells(raster.cells)
          })
          .catch((err: unknown) => {
            if (!auroraCanvas) setAuroraError(describeSwpcFetchOutcome(err))
          })

      const loadKp = () =>
        getPlanetaryKp()
          .then((rows) => {
            kpLoaded = true
            setKp({ status: 'ok', readout: describeKp(rows) })
          })
          .catch((err: unknown) => {
            if (!kpLoaded) setKp({ status: 'error', message: describeSwpcFetchOutcome(err) })
          })

      void loadAurora()
      void loadKp()
      stopSwpcPolling = pollWhileVisible(() => {
        void loadAurora()
        void loadKp()
      }, SWPC_REFRESH_MS)

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
      readyObserver.disconnect()
      mapRef.current = null
      geolocateRef.current = null
      stopSwpcPolling?.()
      map.remove()
    }
  }, [])

  // Reacts to the selection (#44, #149): draws its coverage footprint, flies to it, and
  // emphasises the live layers its services drive (#54). Gated on mapLoaded since the source,
  // fitBounds and setPaintProperty all require a loaded style.
  const alertsHighlighted = liveLayers.includes('nws-alerts')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    map.getSource<GeoJSONSource>(COVERAGE_SOURCE_ID)?.setData(view.footprint)

    if (map.getLayer(ALERTS_FILL_LAYER_ID)) {
      map.setPaintProperty(
        ALERTS_FILL_LAYER_ID,
        'fill-opacity',
        alertsHighlighted ? ALERTS_FILL_OPACITY_SELECTED : ALERTS_FILL_OPACITY,
      )
      map.setPaintProperty(
        ALERTS_LINE_LAYER_ID,
        'line-width',
        alertsHighlighted ? ALERTS_LINE_WIDTH_SELECTED : ALERTS_LINE_WIDTH,
      )
    }

    // MapLibre's own reduced-motion handling skips `essential` moves, so those are only marked
    // essential while animating; with "reduce motion" on the camera jumps instead of flying (#47).
    const reduceMotion = prefersReducedMotion()
    if (view.flyTarget?.kind === 'global') {
      // Worldwide coverage zooms out in place; wide-but-not-worldwide coverage centres on itself (#80).
      const center = view.flyTarget.center ?? map.getCenter()
      if (reduceMotion) map.jumpTo({ center, zoom: GLOBAL_VIEW_ZOOM })
      else map.flyTo({ center, zoom: GLOBAL_VIEW_ZOOM, essential: true })
    } else if (view.flyTarget) {
      // east may exceed 180 when the coverage crosses the antimeridian; MapLibre accepts that.
      const [west, south, east, north] = view.flyTarget.bounds
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 60, maxZoom: 6, essential: !reduceMotion, animate: !reduceMotion },
      )
    }
  }, [view, mapLoaded, alertsHighlighted])

  // The aurora's emphasis (#54) lives apart from the effect above so that the layer arriving
  // (auroraCells) re-applies it without re-framing the globe.
  const auroraHighlighted = liveLayers.includes('aurora')
  useEffect(() => {
    const map = mapRef.current
    if (!map || auroraCells === null || !map.getLayer(AURORA_LAYER_ID)) return
    map.setPaintProperty(AURORA_LAYER_ID, 'raster-opacity', auroraHighlighted ? AURORA_OPACITY_SELECTED : AURORA_OPACITY)
  }, [auroraHighlighted, auroraCells])

  // The stations' emphasis (#51), applied once the layer exists (mapLoaded).
  const coopsHighlighted = liveLayers.includes('coops-stations')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(COOPS_LAYER_ID)) return
    map.setPaintProperty(
      COOPS_LAYER_ID,
      'circle-radius',
      coopsRadius(coopsHighlighted ? COOPS_RADIUS_SELECTED : COOPS_RADIUS),
    )
  }, [coopsHighlighted, mapLoaded])

  // The radar (#56) is shown only while its node is selected, once the layer exists (mapLoaded).
  const radarShown = liveLayers.includes('nowcoast-radar')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(RADAR_LAYER_ID)) return
    map.setLayoutProperty(RADAR_LAYER_ID, 'visibility', radarShown ? 'visible' : 'none')
  }, [radarShown, mapLoaded])

  // The radar's frame list (#74) is fetched while the layer is shown and refreshed as frames age
  // out. A failed fetch leaves the latest-frame layer without a slider. Leaving resets to latest.
  useEffect(() => {
    if (!radarShown) return
    const controller = new AbortController()
    const load = () => {
      fetch(NOWCOAST_CAPABILITIES_URL, { signal: controller.signal })
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
        .then((xml) => setRadarFrames(parseRadarFrames(xml)))
        .catch(() => {})
    }
    load()
    const stopPolling = pollWhileVisible(load, RADAR_FRAMES_REFRESH_MS)
    return () => {
      controller.abort()
      stopPolling()
      setRadarFrames([])
      setRadarTime(null)
    }
  }, [radarShown])

  // Point the source at the chosen frame. Debounced so dragging the slider doesn't refetch tiles
  // for every frame it passes over.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !radarShown) return
    const url = radarTileUrl(radarTime)
    if (url === radarUrlRef.current) return
    const timer = setTimeout(() => {
      ;(map.getSource(RADAR_SOURCE_ID) as RasterTileSource | undefined)?.setTiles([url])
      radarUrlRef.current = url
    }, RADAR_FRAME_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [radarTime, radarShown, mapLoaded])

  const radarIndex = radarTime === null ? radarFrames.length - 1 : Math.max(0, radarFrames.indexOf(radarTime))
  const chooseRadarFrame = useCallback(
    (i: number) => setRadarTime(i >= radarFrames.length - 1 ? null : (radarFrames[i] ?? null)),
    [radarFrames],
  )

  // The DART buoys (#80) are shown only while their node is selected, once the layer exists.
  const dartShown = liveLayers.includes('dart-stations')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(DART_LAYER_ID)) return
    map.setLayoutProperty(DART_LAYER_ID, 'visibility', dartShown ? 'visible' : 'none')
  }, [dartShown, mapLoaded])

  const ndbcShown = liveLayers.includes('ndbc-stations')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(NDBC_LAYER_ID)) return
    map.setLayoutProperty(NDBC_LAYER_ID, 'visibility', ndbcShown ? 'visible' : 'none')
  }, [ndbcShown, mapLoaded])

  return (
    <div className={`globe${view.card ? ' globe-has-card' : ''}`}>
      <div
        ref={containerRef}
        role="group"
        aria-label="Globe view of NOAA API coverage"
        data-coverage-features={view.footprint.features.length}
        data-coops-stations={mapLoaded ? COOPS_STATIONS.length : undefined}
        data-dart-stations={mapLoaded ? (dartShown ? DART_STATIONS.length : 0) : undefined}
        data-ndbc-stations={mapLoaded ? (ndbcShown ? NDBC_STATIONS.length : 0) : undefined}
        data-nowcoast-radar={mapLoaded ? (radarShown ? 'visible' : 'hidden') : undefined}
        data-radar-time={radarShown ? (radarTime ?? 'latest') : undefined}
        data-aurora-cells={auroraCells ?? undefined}
        style={{ width: '100%', height: '100%' }}
      />
      {view.card && (
        <div className="node-selection-status" role="status" aria-label="Selection status">
          <div className="node-selection-status-title">
            {view.card.colors.map((color) => (
              <span key={color} className="node-selection-status-swatch" style={{ background: color }} aria-hidden="true" />
            ))}
            <strong>{view.card.title}</strong>
          </div>
          {view.card.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
      <button
        type="button"
        className="globe-locate"
        aria-label="Find my location"
        aria-busy={locating}
        disabled={locating || !locateReady}
        onClick={() => {
          setGeolocationError(null)
          // False before MapLibre has set the control up (it checks for geolocation support first).
          if (geolocateRef.current?.trigger()) setLocating(true)
          else setGeolocationError(describeGeolocationError(2))
        }}
      >
        <svg className="globe-locate-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <polygon points="3 11 22 2 13 21 11 13 3 11" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <span className="globe-locate-label">{locating ? 'Locating…' : 'My location'}</span>
      </button>
      {geolocationError && (
        <div className="geolocation-status" role="status" aria-label="Location status">
          <p>{geolocationError}</p>
          <button type="button" aria-label="Dismiss" onClick={() => setGeolocationError(null)}>
            ×
          </button>
        </div>
      )}
      {/* The bottom overlays share one flex box: a row on a wide globe (alerts left, Kp right), a
          column on a narrow one, so they never overlap (#159). */}
      <div className="globe-bottom">
        {radarShown && radarFrames.length > 1 && (
          <RadarTimeControl frames={radarFrames} index={radarIndex} onChange={chooseRadarFrame} />
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
        {(kp.status !== 'loading' || auroraError) && (
          <div
            className={`space-weather-readout${liveLayers.includes('kp') ? ' space-weather-readout-highlighted' : ''}`}
            role="status"
            aria-label="Geomagnetic activity"
          >
            {kp.status === 'ok' && (
              <p>
                <strong>Kp {kp.readout.kp}</strong> · {kp.readout.gScale} {kp.readout.label}{' '}
                <span className="space-weather-readout-time">{kp.readout.time}</span>
              </p>
            )}
            {kp.status === 'error' && <p className="space-weather-readout-error">{kp.message}</p>}
            {auroraError && <p className="space-weather-readout-error">Aurora forecast: {auroraError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
