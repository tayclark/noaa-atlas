import { GeolocateControl, Map as MapLibreMap, Popup, setWorkerUrl, type CanvasSource, type ExpressionSpecification, type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent, type RasterTileSource } from 'maplibre-gl'
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

/**
 * Point forecast/observation lookup (#39), shared by a globe click and the locate button. Coverage
 * is purely local (no network call), so it's computed up front and shown whether or not the NWS
 * lookup succeeds (#41).
 */
function showPointLookup(map: MapLibreMap, lng: number, lat: number, ovation: SwpcOvation | null) {
  const popup = new Popup().setLngLat([lng, lat]).setHTML(formatPointLoadingHtml()).addTo(map)
  // The aurora chance here (#54), when the forecast has loaded and this cell has any.
  const aurora = ovation ? auroraAt(ovation, [lng, lat]) : null
  const auroraHtml = ovation && aurora !== null ? `${formatAuroraPopupHtml(aurora, ovation.forecastTime)}<hr/>` : ''
  const coverageHtml = auroraHtml + formatCoveragePopupHtml(describeCoverageForPopup(nodesCoveringPoint(graphNodes, [lng, lat])))
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

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: GLOBE_STYLE_URL,
      center: US_CENTER,
      zoom: US_ZOOM,
    })
    mapRef.current = map
    let stopSwpcPolling: (() => void) | null = null

    const geolocate = new GeolocateControl({
      positionOptions: GEOLOCATE_POSITION_OPTIONS,
      fitBoundsOptions: { maxZoom: GEOLOCATE_MAX_ZOOM },
    })
    map.addControl(geolocate, 'top-right')
    // "Locate me" (the navigation-arrow button): the same lookup as a click, at the user's position.
    geolocate.on('geolocate', (e) => {
      setGeolocationError(null)
      showPointLookup(map, e.coords.longitude, e.coords.latitude, ovationRef.current)
    })
    geolocate.on('error', (e) => setGeolocationError(describeGeolocationError(e.code)))

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
      map.on('click', COOPS_LAYER_ID, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        const station = feature.properties as StationProperties
        const [lng, lat] = feature.geometry.coordinates
        selectPoint([lng, lat])
        const popup = new Popup().setLngLat([lng, lat]).setHTML(formatStationLoadingHtml(station)).addTo(map)
        void Promise.allSettled([getWaterLevel(station.id), getHiloPredictions(station.id)]).then(([water, tides]) => {
          popup.setHTML(formatStationPopupHtml(station, water, tides))
        })
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
      map.on('click', DART_LAYER_ID, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        const [lng, lat] = feature.geometry.coordinates
        selectPoint([lng, lat])
        new Popup().setLngLat([lng, lat]).setHTML(formatDartPopupHtml(feature.properties as DartProperties)).addTo(map)
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
      map.on('click', NDBC_LAYER_ID, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        if (!feature || feature.geometry.type !== 'Point') return
        const [lng, lat] = feature.geometry.coordinates
        selectPoint([lng, lat])
        new Popup().setLngLat([lng, lat]).setHTML(formatNdbcPopupHtml(feature.properties as NdbcProperties)).addTo(map)
      })
      map.on('mouseenter', NDBC_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', NDBC_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      setMapLoaded(true)

      // Point-click forecast/observation lookup (#39). Registered as a global click handler,
      // not layer-scoped like the alerts click handler below, so it works immediately without
      // waiting on the alerts fetch. Guarded so a click on an alert polygon is handled only by
      // the alert popup below, not both — map.getLayer(...) also guards queryRenderedFeatures
      // being called before the alerts layer exists. A tide station is guarded the same way (#51).
      map.on('click', (e: MapMouseEvent) => {
        const layers = [ALERTS_FILL_LAYER_ID, COOPS_LAYER_ID, DART_LAYER_ID, NDBC_LAYER_ID].filter((id) => map.getLayer(id))
        if (layers.length > 0 && map.queryRenderedFeatures(e.point, { layers }).length > 0) return
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
      stopSwpcPolling?.()
      map.remove()
    }
  }, [])

  // Reacts to the selection (#44, #149): draws its coverage footprint, flies to it, and
  // emphasises the live layers its services drive (#54). Gated on mapLoaded since the source,
  // fitBounds and setPaintProperty all require a loaded style.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    map.getSource<GeoJSONSource>(COVERAGE_SOURCE_ID)?.setData(view.footprint)

    const alertsHighlighted = view.liveLayers.includes('nws-alerts')
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
  }, [view, mapLoaded])

  // The aurora's emphasis (#54) lives apart from the effect above so that the layer arriving
  // (auroraCells) re-applies it without re-framing the globe.
  const auroraHighlighted = view.liveLayers.includes('aurora')
  useEffect(() => {
    const map = mapRef.current
    if (!map || auroraCells === null || !map.getLayer(AURORA_LAYER_ID)) return
    map.setPaintProperty(AURORA_LAYER_ID, 'raster-opacity', auroraHighlighted ? AURORA_OPACITY_SELECTED : AURORA_OPACITY)
  }, [auroraHighlighted, auroraCells])

  // The stations' emphasis (#51), applied once the layer exists (mapLoaded).
  const coopsHighlighted = view.liveLayers.includes('coops-stations')
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
  const radarShown = view.liveLayers.includes('nowcoast-radar')
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
  const dartShown = view.liveLayers.includes('dart-stations')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(DART_LAYER_ID)) return
    map.setLayoutProperty(DART_LAYER_ID, 'visibility', dartShown ? 'visible' : 'none')
  }, [dartShown, mapLoaded])

  const ndbcShown = view.liveLayers.includes('ndbc-stations')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(NDBC_LAYER_ID)) return
    map.setLayoutProperty(NDBC_LAYER_ID, 'visibility', ndbcShown ? 'visible' : 'none')
  }, [ndbcShown, mapLoaded])

  return (
    <div className="globe">
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
            className={`space-weather-readout${view.liveLayers.includes('kp') ? ' space-weather-readout-highlighted' : ''}`}
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
