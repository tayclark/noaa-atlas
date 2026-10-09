import { GeolocateControl, LngLat, Map as MapLibreMap, Marker, Popup, type CanvasSource, type ExpressionSpecification, type GeoJSONSource, type LngLatLike, type MapGeoJSONFeature, type MapMouseEvent, type PopupOptions, type RasterTileSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import './GlobePane.css'
import './MapLibreGlobe.css'
import {
  getActiveAlerts,
  getGridpointForecast,
  getLatestObservation,
  getPoint,
  getStations,
} from '../../data/nwsClient'
import { graphFile, tasks } from '../../data/graphData'
import type { ServiceNode } from '../../data/graphSchema'
import type { NwsAlertCollection } from '../../data/nwsSchema'
import { pollWhileVisible } from '../../data/pollWhileVisible'
import { getDay1CategoricalOutlook, SPC_REFRESH_MS } from '../../data/spcClient'
import { getActiveStorms, NHC_REFRESH_MS } from '../../data/nhcClient'
import {
  advisoryFrameIndex,
  buildStormTracks,
  categoriesInTracks,
  categoryLabel,
  describeNhcFetchOutcome,
  formatFixPopupHtml,
  frameTimes,
  framingPadding,
  stormBounds,
  trackFeatures,
  type StormTrack,
} from './stormTrack'
import { StormTrackControl } from './StormTrackControl'
import {
  describeGoesFrame,
  GOES_ATTRIBUTION,
  GOES_CAPABILITIES_URL,
  GOES_FRAMES_REFRESH_MS,
  GOES_OPACITY,
  GOES_TILE_SIZE,
  GOES_TILE_URL,
  goesFrameForTime,
  goesTileUrl,
  parseGoesFrames,
} from './goesSatelliteLayer'
import { getArcgisLegend } from '../../data/arcgisClient'
import {
  ARCGIS_OVERLAYS,
  ARCGIS_TILE_SIZE,
  arcgisExportTileUrl,
  arcgisLegendSections,
  arcgisOverlaysFor,
  describeArcgisFetchOutcome,
  legendEntriesFor,
  type ArcgisLegendState,
  type ArcgisOverlay,
} from './arcgisExportLayer'
import { getHiloPredictions, getWaterLevel } from '../../data/coopsClient'
import { COOPS_STATIONS } from '../../data/coopsStations'
import { loadDartStations } from '../../data/dartStations'
import { loadNdbcStations } from '../../data/ndbcStations'
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
import {
  SPC_FILL_OPACITY,
  categoriesInOutlook,
  describeSpcFetchOutcome,
  formatOutlookPopupHtml,
  isOutlookEmpty,
  type SpcCategory,
} from './spcOutlookLayer'
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
import { createWaveOverlay, type WaveOverlay } from './waveOverlay'
import { createCanvasShadingOverlay, type CanvasShadingOverlay } from './canvasShadingOverlay'
import { describeReflectivity, REFLECTIVITY_BANDS, reflectivityBlend, reflectivityStep, renderReflectivity } from './reflectivityField'
import type { ScalarFieldInput } from './fieldShading'
import { useReflectivityForecast } from './useReflectivityForecast'
import { createWindOverlay, type WindOverlay } from './windOverlay'
import { useWaveForecast } from './useWaveForecast'
import { useWindForecast } from './useWindForecast'
import { WindControl, type ForecastLayer } from './WindControl'
import { NOWCOAST_CAPABILITIES_URL, frameForTime, parseRadarFrames } from './radarTimes'
import { ForecastTimeline } from './ForecastTimeline'
import { getTimeSnapshot, setTime, stopPlayer, subscribeTime } from '../../data/timeStore'
import { describeCoverageForPopup, formatCoveragePopupHtml } from './coveragePopup'
import { hitBox, hitPadding, nearestCandidate } from './hitPick'
import { describeGeolocationError, GEOLOCATE_MAX_ZOOM, GEOLOCATE_POSITION_OPTIONS } from './geolocation'
import { LINKED_POINT_ZOOM, needsLinkedLookup } from './linkedPoint'
import { registerDismisser } from '../escapeDismiss'
import { describeStyleError } from './globeFailure'
import {
  GLOBE_PROJECTION,
  GLOBE_STYLE_URL,
  openingZoom,
  US_CENTER,
} from './globeConfig'
import {
  ALERTS_REFRESH_MS,
  ALERTS_RETRY_MS,
  alertSeverityColorExpression,
  describeAlertForPopup,
  describeAlertsFetchOutcome,
  formatAlertPopupHtml,
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
import { describeSelectionForGlobe, type GlobeViewContext } from './selectionGlobeView'
import { subscribeSelection, getSelectionSnapshot, selectPoint } from '../../data/selectionStore'
import { getViewSnapshot, resolveView, subscribeView } from '../../data/viewStore'
import { useNarrowLayout } from '../useNarrowLayout'

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
// The SPC Day 1 convective outlook (#245): polygons coloured by the feed's own fill and stroke,
// fetched and drawn only while the SPC node is selected.
const SPC_SOURCE_ID = 'spc-outlook'
const SPC_FILL_LAYER_ID = 'spc-outlook-fill'
const SPC_LINE_LAYER_ID = 'spc-outlook-line'
// The NHC storm tracks (#334): every active storm's cone, observed and forecast track, with a
// marker the play control moves along the chosen storm. Fetched and drawn only while the NHC node is selected.
const NHC_SOURCE_ID = 'nhc-tracks'
// GOES infrared imagery under the tracks (#338), so a storm looks as it does on a satellite loop.
const GOES_SOURCE_ID = 'goes-satellite'
const GOES_LAYER_ID = 'goes-satellite-raster'
const NHC_TRAIL_CASING_LAYER_ID = 'nhc-tracks-trail-casing'
const NHC_CONE_FILL_LAYER_ID = 'nhc-tracks-cone-fill'
const NHC_CONE_LINE_LAYER_ID = 'nhc-tracks-cone-line'
const NHC_PAST_LAYER_ID = 'nhc-tracks-past'
const NHC_FORECAST_LAYER_ID = 'nhc-tracks-forecast'
const NHC_TRAIL_LAYER_ID = 'nhc-tracks-trail'
const NHC_FIX_LAYER_ID = 'nhc-tracks-fix'
const NHC_MARKER_LAYER_ID = 'nhc-tracks-marker'
// GFS simulated radar along the forecast part of the storm slider (#340), where no satellite image exists yet.
const REFC_SOURCE_ID = 'gfs-reflectivity'
const REFC_LAYER_ID = 'gfs-reflectivity-raster'
const NHC_LAYER_IDS = [
  NHC_CONE_FILL_LAYER_ID,
  NHC_CONE_LINE_LAYER_ID,
  NHC_PAST_LAYER_ID,
  NHC_FORECAST_LAYER_ID,
  NHC_TRAIL_CASING_LAYER_ID,
  NHC_TRAIL_LAYER_ID,
  NHC_FIX_LAYER_ID,
  NHC_MARKER_LAYER_ID,
]
const NO_STORMS: readonly StormTrack[] = []
const nhcKind = (kind: string): ExpressionSpecification => ['==', ['get', 'kind'], kind]
/** The chosen storm at full strength, the others faded. */
const nhcSelected = (selected: number, other: number): ExpressionSpecification => ['case', ['get', 'selected'], selected, other]
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

// graph.json is parsed once, in graphData.ts (#41, #270), rather than on every click.
const graphNodes: ServiceNode[] = graphFile.nodes
const globeViewContext: GlobeViewContext = {
  nodes: graphNodes,
  tasks,
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
  // The buoy lists load the first time their layer is shown (#269): the count once drawn, or 'error'.
  const [dartStations, setDartStations] = useState<number | 'error' | null>(null)
  const [ndbcStations, setNdbcStations] = useState<number | 'error' | null>(null)
  const [arcgisLegends, setArcgisLegends] = useState<Partial<Record<ArcgisOverlay['key'], ArcgisLegendState>>>({})
  const [spc, setSpc] = useState<
    { status: 'loading' } | { status: 'ok'; categories: SpcCategory[] } | { status: 'empty' } | { status: 'error'; message: string }
  >({ status: 'loading' })
  const [storms, setStorms] = useState<
    { status: 'loading' } | { status: 'ok'; tracks: StormTrack[] } | { status: 'empty' } | { status: 'error'; message: string }
  >({ status: 'loading' })
  // The storm the track control drives, and its scrubbed time; null means the strongest storm and its latest advisory.
  const [stormBin, setStormBin] = useState<string | null>(null)
  const [stormTime, setStormTime] = useState<number | null>(null)
  const [auroraError, setAuroraError] = useState<string | null>(null)
  const [kp, setKp] = useState<{ status: 'loading' } | { status: 'ok'; readout: KpReadout } | { status: 'error'; message: string }>({
    status: 'loading',
  })
  // Radar time (#74): the frame list. The chosen frame comes from the shared time (#228), so the
  // radar and the point forecast timeline scrub together; null follows the latest frame.
  const [radarFrames, setRadarFrames] = useState<string[]>([])
  const sharedTime = useSyncExternalStore(subscribeTime, getTimeSnapshot).time
  const radarTime = useMemo(() => frameForTime(radarFrames, sharedTime), [radarFrames, sharedTime])
  const radarUrlRef = useRef(NOWCOAST_RADAR_TILE_URL)
  const windRef = useRef<WindOverlay | null>(null)
  const waveRef = useRef<WaveOverlay | null>(null)
  const reflectivityRef = useRef<CanvasShadingOverlay<ScalarFieldInput> | null>(null)
  const selection = useSyncExternalStore(subscribeSelection, getSelectionSnapshot)
  const view = useMemo(() => describeSelectionForGlobe(selection, globeViewContext), [selection])
  // A tap on the globe selects a point, which replaces the service whose radar or buoys were on
  // screen, and with them goes the layer the reader was looking at, even when the tap was on one
  // of its own buoys (#78). The layers stay while a point is selected.
  const [heldLayers, setHeldLayers] = useState(view.liveLayers)
  if (!selection.selectedPoint && heldLayers !== view.liveLayers) setHeldLayers(view.liveLayers)
  const liveLayers = selection.selectedPoint ? heldLayers : view.liveLayers
  // On a phone the globe is a tab that stays mounted while another shows (#78). Hidden, it does no
  // work for nobody: its loops and polling pause, and the camera waits for it to be seen again. A
  // wide layout shows it always.
  const compact = useNarrowLayout()
  const requestedView = useSyncExternalStore(subscribeView, getViewSnapshot)
  const active = !compact || resolveView(requestedView, true) === 'globe'
  const geolocateRef = useRef<GeolocateControl | null>(null)
  const [locating, setLocating] = useState(false)
  // Which selection the camera was last moved for, so a tab that is seen again is framed on a
  // selection made while it was hidden, but is not snapped back over where the reader has panned.
  const framedViewRef = useRef<typeof view | null>(null)
  // Space weather is refreshed while the globe is looked at, and at once on return if it is stale.
  const refreshSpaceWeatherRef = useRef<() => void>(() => {})
  const spaceWeatherAtRef = useRef(0)
  const refreshAlertsRef = useRef<() => void>(() => {})
  const alertsAtRef = useRef(0)
  // MapLibre enables its own button once it knows the browser can geolocate; ours waits for that.
  const [locateReady, setLocateReady] = useState(false)
  // Set when the basemap fails before `load`, which then never fires and leaves no layers (#260).
  const [mapError, setMapError] = useState<string | null>(null)
  // The map has keyboard focus, so the centre marker that Enter looks up shows (#267).
  const [keyboardFocus, setKeyboardFocus] = useState(false)

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

    // An error before `load` (the style or its sources failing) means `load` may never come, so say
    // why the globe is empty. Later errors, such as a missing tile, keep being ignored.
    let loaded = false
    map.on('error', (e) => {
      if (!loaded) setMapError(describeStyleError(e.error))
    })

    // Keyboard (#267): MapLibre pans the focused map with the arrow keys, and Enter asks about the
    // spot under the centre marker, as a click there would. The marker shows only while the map
    // has keyboard focus. Escape closes the popup (escapeDismiss.ts), before it clears the selection.
    const canvas = map.getCanvas()
    canvas.setAttribute('aria-keyshortcuts', 'Enter')
    // The centre hint is visual only, so screen readers get the keys from this description (#290).
    canvas.setAttribute('aria-describedby', 'globe-keyboard-hint')
    const onCanvasKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !loaded) return
      event.preventDefault()
      const { lng, lat } = map.getCenter()
      showPointLookup(map, lng, lat, ovationRef.current)
    }
    const onCanvasFocus = () => setKeyboardFocus(canvas.matches(':focus-visible'))
    const onCanvasBlur = () => setKeyboardFocus(false)
    canvas.addEventListener('keydown', onCanvasKeyDown)
    canvas.addEventListener('focus', onCanvasFocus)
    canvas.addEventListener('blur', onCanvasBlur)
    const unregisterDismisser = registerDismisser(() => {
      if (!openPopup) return false
      // MapLibre focuses a popup as it opens, so closing one would leave focus on nothing. It goes
      // back to the map instead, where the reader was.
      const hadFocus = openPopup.getElement()?.contains(document.activeElement) ?? false
      openPopup.remove()
      if (hadFocus) canvas.focus()
      return true
    })

    // setProjection must run after the style has finished loading, or
    // MapLibre throws "Style is not done loading."
    map.on('load', () => {
      loaded = true
      setMapError(null)
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
      // The wind overlay (#229) draws over the radar and under the stations and alerts; it stays
      // hidden, and requests nothing, until the GFS node is selected.
      windRef.current = createWindOverlay(map, prefersReducedMotion())
      waveRef.current = createWaveOverlay(map)
      // The SPC outlook (#245) sits over the wind and under the stations and alerts. It starts
      // empty and hidden; the effect below fills it while the SPC node is selected.
      map.addSource(SPC_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: SPC_FILL_LAYER_ID,
        type: 'fill',
        source: SPC_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': SPC_FILL_OPACITY },
      })
      map.addLayer({
        id: SPC_LINE_LAYER_ID,
        type: 'line',
        source: SPC_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: { 'line-color': ['get', 'stroke'], 'line-width': 1.5 },
      })
      // ArcGIS overlays (#247) draw over the SPC outlook and under the stations and alerts. Hidden
      // layers fetch no tiles, so nothing is requested until a node is selected.
      for (const overlay of ARCGIS_OVERLAYS) {
        map.addSource(overlay.sourceId, {
          type: 'raster',
          tiles: [arcgisExportTileUrl(overlay.serviceUrl, overlay.layerIdsInService)],
          tileSize: ARCGIS_TILE_SIZE,
          attribution: overlay.attribution,
        })
        map.addLayer({
          id: overlay.layerId,
          type: 'raster',
          source: overlay.sourceId,
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': overlay.opacity, 'raster-fade-duration': 0 },
        })
      }
      // The storm tracks (#334) draw over the rasters and under the stations and alerts. Empty and
      // hidden until the NHC node is selected.
      map.addSource(GOES_SOURCE_ID, { type: 'raster', tiles: [GOES_TILE_URL], tileSize: GOES_TILE_SIZE, attribution: GOES_ATTRIBUTION })
      map.addLayer({
        id: GOES_LAYER_ID,
        type: 'raster',
        source: GOES_SOURCE_ID,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': GOES_OPACITY, 'raster-fade-duration': 0 },
      })
      reflectivityRef.current = createCanvasShadingOverlay(map, {
        sourceId: REFC_SOURCE_ID,
        layerId: REFC_LAYER_ID,
        size: 1024,
        opacity: 0.9,
        render: renderReflectivity,
      })
      map.addSource(NHC_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const nhcLayout = { visibility: 'none' as const }
      map.addLayer({
        id: NHC_CONE_FILL_LAYER_ID,
        type: 'fill',
        source: NHC_SOURCE_ID,
        filter: nhcKind('cone'),
        layout: nhcLayout,
        paint: { 'fill-color': '#ffffff', 'fill-opacity': nhcSelected(0.22, 0.08) },
      })
      map.addLayer({
        id: NHC_CONE_LINE_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('cone'),
        layout: nhcLayout,
        paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': nhcSelected(0.8, 0.3) },
      })
      map.addLayer({
        id: NHC_PAST_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('past'),
        layout: { ...nhcLayout, 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': nhcSelected(0.6, 0.35) },
      })
      map.addLayer({
        id: NHC_FORECAST_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('forecast'),
        layout: { ...nhcLayout, 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': nhcSelected(0.6, 0.35) },
      })
      // A dark casing keeps the white trail readable over white cloud tops.
      map.addLayer({
        id: NHC_TRAIL_CASING_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('trail'),
        layout: { ...nhcLayout, 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#111827', 'line-width': 6, 'line-opacity': 0.8 },
      })
      map.addLayer({
        id: NHC_TRAIL_LAYER_ID,
        type: 'line',
        source: NHC_SOURCE_ID,
        filter: nhcKind('trail'),
        layout: { ...nhcLayout, 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 3 },
      })
      map.addLayer({
        id: NHC_FIX_LAYER_ID,
        type: 'circle',
        source: NHC_SOURCE_ID,
        filter: nhcKind('fix'),
        layout: nhcLayout,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': nhcSelected(4, 3),
          'circle-opacity': nhcSelected(1, 0.5),
          'circle-stroke-color': '#111827',
          'circle-stroke-width': 1,
          'circle-stroke-opacity': nhcSelected(1, 0.5),
        },
      })
      map.addLayer({
        id: NHC_MARKER_LAYER_ID,
        type: 'circle',
        source: NHC_SOURCE_ID,
        filter: nhcKind('marker'),
        layout: nhcLayout,
        // A ring, not a dot, so the eye on the satellite image shows through it.
        paint: { 'circle-opacity': 0, 'circle-radius': 11, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 3 },
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
      map.addSource(DART_SOURCE_ID, { type: 'geojson', data: dartStationsToGeoJSON([]) })
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
      map.addSource(NDBC_SOURCE_ID, { type: 'geojson', data: ndbcStationsToGeoJSON([]) })
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
      // padded box and the nearest dot wins), else an alert polygon under the point, else an SPC
      // outlook area, else a forecast and coverage lookup there. Alerts and outlook areas also
      // select the point. Layers that aren't drawn yet are skipped.
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

        const fixes = map.getLayer(NHC_FIX_LAYER_ID) ? map.queryRenderedFeatures(hitBox(e.point, padding), { layers: [NHC_FIX_LAYER_ID] }) : []
        const fix = nearestCandidate(
          fixes.flatMap((feature) => (feature.geometry.type === 'Point' ? [{ feature, ...map.project(feature.geometry.coordinates as [number, number]) }] : [])),
          e.point,
        )
        if (fix?.geometry.type === 'Point') {
          showPopup(map, fix.geometry.coordinates as [number, number], formatFixPopupHtml(fix.properties))
          return
        }

        const alert = map.getLayer(ALERTS_FILL_LAYER_ID) ? map.queryRenderedFeatures(e.point, { layers: [ALERTS_FILL_LAYER_ID] })[0] : undefined
        if (alert?.properties) {
          const content = describeAlertForPopup(alert.properties as Parameters<typeof describeAlertForPopup>[0])
          // e.lngLat is guaranteed inside the polygon (queryRenderedFeatures matched it), so it's a
          // valid representative point for coverage lookup (#45).
          selectPoint([e.lngLat.lng, e.lngLat.lat])
          showPopup(map, e.lngLat, formatAlertPopupHtml(content))
          return
        }

        const outlook = map.getLayer(SPC_FILL_LAYER_ID) ? map.queryRenderedFeatures(e.point, { layers: [SPC_FILL_LAYER_ID] }) : []
        if (outlook.length > 0) {
          // SPC lists the categories low to high and draws them in that order, so the last is on top.
          const top = outlook[outlook.length - 1]
          // Like an alert, the outlook area selects the point under it (#274).
          selectPoint([e.lngLat.lng, e.lngLat.lat])
          showPopup(map, e.lngLat, formatOutlookPopupHtml(top.properties as Parameters<typeof formatOutlookPopupHtml>[0]))
          return
        }

        showPointLookup(map, e.lngLat.lng, e.lngLat.lat, ovationRef.current)
      })

      // Both files are re-fetched every few minutes while the globe is looked at (see the effect
      // below). A failed refresh keeps what is already on screen; only a failed first load shows
      // an error.
      let auroraCanvas: HTMLCanvasElement | null = null
      let kpLoaded = false

      const loadAurora = () =>
        getOvationAurora().then(
          (ovation) => {
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
          },
          (err: unknown) => {
            if (!auroraCanvas) setAuroraError(describeSwpcFetchOutcome(err))
          },
        )

      const loadKp = () =>
        getPlanetaryKp().then(
          (rows) => {
            kpLoaded = true
            setKp({ status: 'ok', readout: describeKp(rows) })
          },
          (err: unknown) => {
            if (!kpLoaded) setKp({ status: 'error', message: describeSwpcFetchOutcome(err) })
          },
        )

      refreshSpaceWeatherRef.current = () => {
        spaceWeatherAtRef.current = Date.now()
        void loadAurora()
        void loadKp()
      }
      refreshSpaceWeatherRef.current()

      let alertsLoaded = false
      const loadAlerts = () =>
        getActiveAlerts()
        .then((alerts) => {
          const { mappable, zoneOnly } = splitAlertsByGeometry(alerts)
          setZoneOnlyAlerts(zoneOnly)
          setAlertsStatus(mappable.features.length === 0 && zoneOnly.length === 0 ? 'empty' : 'ok')

          const existing = map.getSource<GeoJSONSource>(ALERTS_SOURCE_ID)
          if (existing) {
            existing.setData(mappable)
            return
          }
          alertsLoaded = true

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
          // A failed refresh keeps the last good alerts on screen.
          if (alertsLoaded) return
          setAlertsStatus('error')
          setAlertsErrorMessage(describeAlertsFetchOutcome(err))
        })

      refreshAlertsRef.current = () => {
        alertsAtRef.current = Date.now()
        void loadAlerts()
      }
      refreshAlertsRef.current()
    })

    return () => {
      readyObserver.disconnect()
      unregisterDismisser()
      canvas.removeEventListener('keydown', onCanvasKeyDown)
      canvas.removeEventListener('focus', onCanvasFocus)
      canvas.removeEventListener('blur', onCanvasBlur)
      mapRef.current = null
      geolocateRef.current = null
      windRef.current?.dispose()
      windRef.current = null
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

    // A hidden globe measures as 400x300 (MapLibre's fallback), so a camera move now would frame the
    // selection for the wrong size. It waits until the tab is seen, and then happens once (#78).
    if (!active || framedViewRef.current === view) return
    framedViewRef.current = view
    map.resize()

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
  }, [view, mapLoaded, alertsHighlighted, active])

  // A point selected by a link or by Back (#266) frames itself and opens its lookup, as a click
  // there would. Once per point, so a popup the reader closed doesn't come back on a tab switch.
  const linkedPointRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    const point = selection.selectedPoint
    if (!map || !mapLoaded || !active || !point) return
    const key = point.join(',')
    if (linkedPointRef.current === key) return
    linkedPointRef.current = key
    const popupAt = openPopup?.getLngLat()
    if (!needsLinkedLookup(point, popupAt ? [popupAt.lng, popupAt.lat] : null)) return
    const camera = { center: point as [number, number], zoom: Math.max(map.getZoom(), LINKED_POINT_ZOOM) }
    if (prefersReducedMotion()) map.jumpTo(camera)
    else map.flyTo({ ...camera, essential: true })
    showPointLookup(map, point[0], point[1], ovationRef.current)
  }, [selection.selectedPoint, mapLoaded, active])

  // The aurora's emphasis (#54) lives apart from the effect above so that the layer arriving
  // (auroraCells) re-applies it without re-framing the globe.
  const auroraHighlighted = liveLayers.includes('aurora')
  useEffect(() => {
    const map = mapRef.current
    if (!map || auroraCells === null || !map.getLayer(AURORA_LAYER_ID)) return
    map.setPaintProperty(AURORA_LAYER_ID, 'raster-opacity', auroraHighlighted ? AURORA_OPACITY_SELECTED : AURORA_OPACITY)
  }, [auroraHighlighted, auroraCells])

  // The aurora forecast and Kp are refreshed every few minutes while the globe is looked at. Coming
  // back to it after longer than that refreshes at once, rather than showing a stale readout until
  // the next tick (#78).
  useEffect(() => {
    if (!mapLoaded || !active) return
    if (Date.now() - spaceWeatherAtRef.current >= SWPC_REFRESH_MS) refreshSpaceWeatherRef.current()
    return pollWhileVisible(() => refreshSpaceWeatherRef.current(), SWPC_REFRESH_MS)
  }, [mapLoaded, active])

  // The alerts are refreshed on the same terms as space weather (#222), and a failed first load is
  // retried sooner, until it succeeds.
  useEffect(() => {
    if (!mapLoaded || !active) return
    if (Date.now() - alertsAtRef.current >= ALERTS_REFRESH_MS) refreshAlertsRef.current()
    return pollWhileVisible(() => refreshAlertsRef.current(), ALERTS_REFRESH_MS)
  }, [mapLoaded, active])

  const alertsFailed = alertsStatus === 'error'
  useEffect(() => {
    if (!mapLoaded || !active || !alertsFailed) return
    return pollWhileVisible(() => refreshAlertsRef.current(), ALERTS_RETRY_MS)
  }, [mapLoaded, active, alertsFailed])

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

  // The radar's frame list (#74) is fetched while the layer is shown, and refreshed as frames age
  // out for as long as the globe is looked at (#78). A failed fetch leaves the latest-frame layer
  // without a slider. Leaving resets to latest (#286): the shared time returns to now and a radar
  // loop stops, so the point timeline and the wind also start from now after the radar goes.
  const loadRadarFrames = useCallback((signal?: AbortSignal) => {
    fetch(NOWCOAST_CAPABILITIES_URL, signal ? { signal } : undefined)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((xml) => setRadarFrames(parseRadarFrames(xml)))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!radarShown) return
    const controller = new AbortController()
    loadRadarFrames(controller.signal)
    return () => {
      controller.abort()
      setRadarFrames([])
      stopPlayer('radar')
      setTime(null)
    }
  }, [radarShown, loadRadarFrames])
  useEffect(() => {
    if (!radarShown || !active) return
    return pollWhileVisible(() => loadRadarFrames(), RADAR_FRAMES_REFRESH_MS)
  }, [radarShown, active, loadRadarFrames])

  // Seen again after being hidden: MapLibre's own resize observer is throttled, so say so at once.
  useEffect(() => {
    if (active) mapRef.current?.resize()
  }, [active])

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
    (i: number) => setTime(i >= radarFrames.length - 1 ? null : Date.parse(radarFrames[i])),
    [radarFrames],
  )

  // The wind and wave overlays (#229) load and draw only while the GFS node is selected, one at a
  // time (chosen in the control), and follow the shared time like the radar.
  const gfsShown = liveLayers.includes('wind')
  const [forecastLayer, setForecastLayer] = useState<ForecastLayer>('wind')
  const windShown = gfsShown && forecastLayer === 'wind'
  const wavesShown = gfsShown && forecastLayer === 'waves'
  const wind = useWindForecast(windShown, sharedTime)
  const waves = useWaveForecast(wavesShown, sharedTime)
  const windField = wind.status === 'idle' ? null : wind.field
  const waveField = waves.status === 'idle' ? null : waves.field
  useEffect(() => {
    if (mapLoaded) windRef.current?.setVisible(windShown)
  }, [windShown, mapLoaded])
  useEffect(() => {
    if (mapLoaded) windRef.current?.setField(windField)
  }, [windField, mapLoaded])
  useEffect(() => {
    windRef.current?.setPaused(!active)
  }, [active, mapLoaded])
  useEffect(() => {
    if (mapLoaded) waveRef.current?.setVisible(wavesShown)
  }, [wavesShown, mapLoaded])
  useEffect(() => {
    if (mapLoaded) waveRef.current?.setField(waveField)
  }, [waveField, mapLoaded])
  const forecast = forecastLayer === 'wind' ? wind : waves
  const forecastCycle = forecast.status === 'idle' ? null : forecast.cycle
  const forecastLabel = forecastLayer === 'wind' ? 'Wind' : 'Wave'

  // The DART buoys (#80) are shown only while their node is selected, once the layer exists. The
  // list loads the first time they're shown (#269).
  const dartShown = liveLayers.includes('dart-stations')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(DART_LAYER_ID)) return
    map.setLayoutProperty(DART_LAYER_ID, 'visibility', dartShown ? 'visible' : 'none')
    if (!dartShown || dartStations !== null) return
    let cancelled = false
    loadDartStations()
      .then((stations) => {
        if (cancelled) return
        map.getSource<GeoJSONSource>(DART_SOURCE_ID)?.setData(dartStationsToGeoJSON(stations))
        setDartStations(stations.length)
      })
      .catch(() => {
        if (!cancelled) setDartStations('error')
      })
    return () => {
      cancelled = true
    }
  }, [dartShown, dartStations, mapLoaded])

  // The SPC outlook (#245) is fetched only while its node is selected, and refreshed while the tab
  // is visible. A failed refresh keeps the polygons already drawn.
  const spcShown = liveLayers.includes('spc-outlook')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(SPC_FILL_LAYER_ID)) return
    const visibility = spcShown ? 'visible' : 'none'
    map.setLayoutProperty(SPC_FILL_LAYER_ID, 'visibility', visibility)
    map.setLayoutProperty(SPC_LINE_LAYER_ID, 'visibility', visibility)
    if (!spcShown) return
    let cancelled = false
    let loaded = false
    const load = () => {
      getDay1CategoricalOutlook()
        .then((outlook) => {
          if (cancelled) return
          loaded = true
          map.getSource<GeoJSONSource>(SPC_SOURCE_ID)?.setData(outlook)
          setSpc(isOutlookEmpty(outlook) ? { status: 'empty' } : { status: 'ok', categories: categoriesInOutlook(outlook) })
        })
        .catch((err: unknown) => {
          if (!cancelled && !loaded) setSpc({ status: 'error', message: describeSpcFetchOutcome(err) })
        })
    }
    load()
    const stop = pollWhileVisible(load, SPC_REFRESH_MS)
    return () => {
      cancelled = true
      stop()
    }
  }, [spcShown, mapLoaded])

  // The NHC storm tracks (#334), like the SPC outlook: fetched only while the node is selected and
  // refreshed while the tab is visible. A failed refresh keeps the tracks already drawn.
  const nhcShown = liveLayers.includes('nhc-tracks')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(NHC_FIX_LAYER_ID)) return
    for (const id of NHC_LAYER_IDS) map.setLayoutProperty(id, 'visibility', nhcShown ? 'visible' : 'none')
    if (!nhcShown) return
    let cancelled = false
    let loaded = false
    const load = () => {
      getActiveStorms()
        .then((data) => {
          if (cancelled) return
          loaded = true
          const tracks = buildStormTracks(data)
          setStorms(tracks.length === 0 ? { status: 'empty' } : { status: 'ok', tracks })
        })
        .catch((err: unknown) => {
          if (!cancelled && !loaded) setStorms({ status: 'error', message: describeNhcFetchOutcome(err) })
        })
    }
    load()
    const stop = pollWhileVisible(load, NHC_REFRESH_MS)
    return () => {
      cancelled = true
      stop()
    }
  }, [nhcShown, mapLoaded])

  const stormTracks = storms.status === 'ok' ? storms.tracks : NO_STORMS
  const storm = stormTracks.find((track) => track.bin === stormBin) ?? stormTracks[0] ?? null
  const stormFrames = useMemo(() => (storm ? frameTimes(storm) : []), [storm])
  const stormAdvisoryIndex = storm ? advisoryFrameIndex(stormFrames, storm) : 0
  const stormFound = stormTime === null ? -1 : stormFrames.findIndex((t) => t >= stormTime)
  const stormIndex = stormTime === null ? stormAdvisoryIndex : stormFound === -1 ? stormFrames.length - 1 : stormFound
  const chooseStormFrame = useCallback((i: number) => setStormTime(stormFrames[i] ?? null), [stormFrames])
  const chooseStorm = useCallback((bin: string) => {
    setStormBin(bin)
    setStormTime(null)
  }, [])

  // Redraws the tracks, with the chosen storm's trail and marker at the scrubbed time.
  const stormFrameTime = stormFrames[stormIndex] ?? null
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !nhcShown) return
    map.getSource<GeoJSONSource>(NHC_SOURCE_ID)?.setData(trackFeatures(stormTracks, storm?.bin ?? null, stormFrameTime))
  }, [stormTracks, storm, stormFrameTime, nhcShown, mapLoaded])

  // The GOES frame list (#338) is read while the tracks are shown and refreshed as frames arrive. A
  // failed read leaves the latest image, which needs no list. The image follows the storm slider
  // inside the archive and is the latest one outside it; debounced like the radar.
  const [goesFrames, setGoesFrames] = useState<string[]>([])
  const loadGoesFrames = useCallback((signal?: AbortSignal) => {
    fetch(GOES_CAPABILITIES_URL, signal ? { signal } : undefined)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((xml) => setGoesFrames(parseGoesFrames(xml)))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!nhcShown) return
    const controller = new AbortController()
    loadGoesFrames(controller.signal)
    return () => {
      controller.abort()
      setGoesFrames([])
    }
  }, [nhcShown, loadGoesFrames])
  useEffect(() => {
    if (!nhcShown || !active) return
    return pollWhileVisible(() => loadGoesFrames(), GOES_FRAMES_REFRESH_MS)
  }, [nhcShown, active, loadGoesFrames])
  const goesFrame = goesFrameForTime(goesFrames, stormFrameTime)
  // Past the advisory there is no satellite image of the storm yet, so the GFS simulated radar takes
  // its place. The first forecast step is loaded while the slider is still before the advisory.
  const stormInForecast = nhcShown && storm !== null && stormFrameTime !== null && stormFrameTime > storm.advisoryTime
  const reflectivityTime = storm ? Math.max(stormFrameTime ?? storm.advisoryTime, storm.advisoryTime) : null
  const reflectivity = useReflectivityForecast(nhcShown && storm !== null, reflectivityTime === null ? null : reflectivityStep(reflectivityTime))
  const reflectivityPair = reflectivity.status === 'idle' ? null : reflectivity.field
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(GOES_LAYER_ID)) return
    map.setLayoutProperty(GOES_LAYER_ID, 'visibility', nhcShown && !stormInForecast ? 'visible' : 'none')
    reflectivityRef.current?.setVisible(stormInForecast)
  }, [nhcShown, stormInForecast, mapLoaded])
  useEffect(() => {
    if (!mapLoaded || !stormInForecast || reflectivityTime === null) return
    reflectivityRef.current?.setField(reflectivityPair && { a: reflectivityPair.a, b: reflectivityPair.b, t: reflectivityBlend(reflectivityTime) })
  }, [reflectivityPair, reflectivityTime, stormInForecast, mapLoaded])
  const goesUrlRef = useRef(GOES_TILE_URL)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !nhcShown) return
    const url = goesTileUrl(goesFrame)
    if (url === goesUrlRef.current) return
    const timer = setTimeout(() => {
      ;(map.getSource(GOES_SOURCE_ID) as RasterTileSource | undefined)?.setTiles([url])
      goesUrlRef.current = url
    }, RADAR_FRAME_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [goesFrame, nhcShown, mapLoaded])

  // Frames the chosen storm when its tracks first arrive and whenever another storm is chosen.
  const framedStormRef = useRef<string | null>(null)
  useEffect(() => {
    if (!nhcShown) {
      framedStormRef.current = null
      return
    }
    const map = mapRef.current
    if (!map || !mapLoaded || !active || !storm || framedStormRef.current === storm.bin) return
    framedStormRef.current = storm.bin
    const bounds = stormBounds(storm)
    if (!bounds) return
    const [west, south, east, north] = bounds
    // Clear of the selection card above and the play control and legend below.
    const globeBox = map.getContainer().getBoundingClientRect()
    const root = map.getContainer().parentElement
    const cardBox = root?.querySelector('.node-selection-status')?.getBoundingClientRect()
    const bottomBox = root?.querySelector('.globe-bottom')?.getBoundingClientRect()
    const padding = framingPadding(
      globeBox,
      cardBox ? cardBox.bottom - globeBox.top : 0,
      bottomBox && bottomBox.height > 0 ? globeBox.bottom - bottomBox.top : 0,
    )
    const reduceMotion = prefersReducedMotion()
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding, maxZoom: 5, essential: !reduceMotion, animate: !reduceMotion },
    )
  }, [storm, nhcShown, mapLoaded, active])

  // The ArcGIS overlays (#247) are drawn while a selection lights them, every one of them when a
  // hub or task lights several (#288). Their legends are the requests the client logs; a failed
  // legend leaves its overlay drawn. The key is a string so the effect doesn't re-run per render.
  const arcgisOverlays = arcgisOverlaysFor(liveLayers)
  const arcgisKey = arcgisOverlays.map((overlay) => overlay.key).join(' ')
  const arcgisSections = arcgisLegendSections(arcgisOverlays, arcgisLegends)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const keys = arcgisKey.split(' ')
    const overlays = ARCGIS_OVERLAYS.filter((overlay) => keys.includes(overlay.key))
    for (const overlay of ARCGIS_OVERLAYS) {
      if (map.getLayer(overlay.layerId)) map.setLayoutProperty(overlay.layerId, 'visibility', overlays.includes(overlay) ? 'visible' : 'none')
    }
    let cancelled = false
    const settle = (key: ArcgisOverlay['key'], state: ArcgisLegendState) => {
      if (!cancelled) setArcgisLegends((prev) => ({ ...prev, [key]: state }))
    }
    for (const overlay of overlays) {
      if (overlay.hasLegend === false) continue
      getArcgisLegend(overlay.serviceUrl)
        .then((legend) => settle(overlay.key, { status: 'ok', entries: legendEntriesFor(legend, overlay.layerIdsInService) }))
        .catch((err: unknown) => settle(overlay.key, { status: 'error', message: describeArcgisFetchOutcome(err) }))
    }
    return () => {
      cancelled = true
      setArcgisLegends({})
    }
  }, [arcgisKey, mapLoaded])

  // The NDBC buoys load the first time they're shown too (#269).
  const ndbcShown = liveLayers.includes('ndbc-stations')
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !map.getLayer(NDBC_LAYER_ID)) return
    map.setLayoutProperty(NDBC_LAYER_ID, 'visibility', ndbcShown ? 'visible' : 'none')
    if (!ndbcShown || ndbcStations !== null) return
    let cancelled = false
    loadNdbcStations()
      .then((stations) => {
        if (cancelled) return
        map.getSource<GeoJSONSource>(NDBC_SOURCE_ID)?.setData(ndbcStationsToGeoJSON(stations))
        setNdbcStations(stations.length)
      })
      .catch(() => {
        if (!cancelled) setNdbcStations('error')
      })
    return () => {
      cancelled = true
    }
  }, [ndbcShown, ndbcStations, mapLoaded])

  return (
    <div className={`globe${view.card ? ' globe-has-card' : ''}`}>
      <div
        ref={containerRef}
        role="group"
        aria-label="Globe view of NOAA API coverage"
        data-coverage-features={view.footprint.features.length}
        data-coops-stations={mapLoaded ? COOPS_STATIONS.length : undefined}
        data-dart-stations={mapLoaded ? (dartShown ? (dartStations ?? 'loading') : 0) : undefined}
        data-arcgis-overlay={mapLoaded ? arcgisKey || 'hidden' : undefined}
        data-spc-outlook={mapLoaded ? (spcShown ? spc.status : 'hidden') : undefined}
        data-nhc-tracks={mapLoaded ? (nhcShown ? storms.status : 'hidden') : undefined}
        data-nhc-storm={nhcShown && storm ? storm.bin : undefined}
        data-goes-time={nhcShown && !stormInForecast ? (goesFrame ?? 'latest') : undefined}
        data-gfs-reflectivity={nhcShown ? (stormInForecast && reflectivity.status !== 'idle' ? reflectivity.status : 'hidden') : undefined}
        data-ndbc-stations={mapLoaded ? (ndbcShown ? (ndbcStations ?? 'loading') : 0) : undefined}
        data-nowcoast-radar={mapLoaded ? (radarShown ? 'visible' : 'hidden') : undefined}
        data-wind={mapLoaded ? (windShown ? (windField ? 'visible' : 'loading') : 'hidden') : undefined}
        data-waves={mapLoaded ? (wavesShown ? (waveField ? 'visible' : 'loading') : 'hidden') : undefined}
        data-radar-time={radarShown ? (radarTime ?? 'latest') : undefined}
        data-aurora-cells={auroraCells ?? undefined}
        style={{ width: '100%', height: '100%' }}
      />
      <p id="globe-keyboard-hint" className="visually-hidden">
        With the map focused, arrow keys pan and plus and minus zoom. Enter looks up the forecast and coverage at the
        centre of the map, and Escape closes the popup.
      </p>
      {keyboardFocus && (
        <div className="globe-centre" aria-hidden="true">
          <span className="globe-centre-mark" />
          <span className="globe-centre-hint">Enter: look up this spot · Esc: close</span>
        </div>
      )}
      {mapError && (
        <div className="globe-map-status" role="status" aria-label="Map status">
          <p>{mapError}</p>
        </div>
      )}
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
        {selection.selectedPoint && (
          <ForecastTimeline
            key={selection.selectedPoint.join(',')}
            point={selection.selectedPoint}
            paused={!active}
          />
        )}
        {radarShown && radarFrames.length > 1 && (
          <RadarTimeControl frames={radarFrames} index={radarIndex} onChange={chooseRadarFrame} paused={!active} />
        )}
        {gfsShown && forecastCycle !== null && (
          <WindControl
            layer={forecastLayer}
            onLayerChange={setForecastLayer}
            cycle={forecastCycle}
            time={sharedTime}
            onChange={setTime}
            paused={!active}
            error={forecast.status === 'error' ? forecast.message : null}
          />
        )}
        {gfsShown && forecastCycle === null && forecast.status === 'error' && (
          <div className="zone-only-alerts" role="status" aria-label={`${forecastLabel} status`}>
            {forecast.message}
            <button type="button" className="radar-time-step wind-status-action" onClick={() => setForecastLayer(forecastLayer === 'wind' ? 'waves' : 'wind')}>
              Show {forecastLayer === 'wind' ? 'waves' : 'wind'} instead
            </button>
          </div>
        )}
        {nhcShown && storm && stormFrames.length > 1 && (
          <StormTrackControl
            tracks={stormTracks}
            track={storm}
            onTrackChange={chooseStorm}
            frames={stormFrames}
            index={stormIndex}
            advisoryIndex={stormAdvisoryIndex}
            onChange={chooseStormFrame}
            imagery={
              stormInForecast && reflectivity.status !== 'idle'
                ? describeReflectivity(reflectivity.status, reflectivity.cycle)
                : describeGoesFrame(goesFrames, goesFrame)
            }
            paused={!active}
          />
        )}
        {nhcShown && storms.status === 'ok' && (
          <div className="zone-only-alerts spc-legend storm-legend" role="status" aria-label="Storm track legend">
            <strong>Storm intensity</strong>
            <ul>
              {categoriesInTracks(storms.tracks).map((category) => (
                <li key={category.key} title={category.name}>
                  <span className="spc-legend-swatch storm-legend-swatch" style={{ background: category.color }} aria-hidden="true" />
                  <span aria-hidden="true">{categoryLabel(category)}</span>
                  <span className="visually-hidden">{category.name}</span>
                </li>
              ))}
            </ul>
            {stormInForecast && (
              <>
                <strong>GFS simulated radar (dBZ)</strong>
                <ul>
                  {REFLECTIVITY_BANDS.filter((_, i) => i % 2 === 0).map((band) => (
                    <li key={band.dbz}>
                      <span className="spc-legend-swatch" style={{ background: band.color }} aria-hidden="true" />
                      {band.dbz}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {nhcShown && (storms.status === 'empty' || storms.status === 'error') && (
          <div className="zone-only-alerts" role="status" aria-label="Storm track status">
            {storms.status === 'empty' ? 'No active tropical cyclones in the Atlantic or eastern and central Pacific right now.' : storms.message}
          </div>
        )}
        {spcShown && spc.status === 'ok' && (
          <div className="zone-only-alerts spc-legend" role="status" aria-label="Convective outlook legend">
            <strong>Day 1 convective outlook</strong>
            <ul>
              {spc.categories.map((category) => (
                <li key={category.label}>
                  <span className="spc-legend-swatch" style={{ background: category.color }} aria-hidden="true" />
                  {category.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {spcShown && spc.status === 'empty' && (
          <div className="zone-only-alerts" role="status" aria-label="Convective outlook status">
            No convective outlook areas today.
          </div>
        )}
        {spcShown && spc.status === 'error' && (
          <div className="zone-only-alerts" role="status" aria-label="Convective outlook status">
            {spc.message}
          </div>
        )}
        {arcgisSections.length === 1 && arcgisSections[0] && 'message' in arcgisSections[0] && (
          <div className="zone-only-alerts" role="status" aria-label="Map overlay legend">
            {arcgisSections[0].message}
          </div>
        )}
        {arcgisSections.some((section) => 'entries' in section) || arcgisSections.length > 1 ? (
          <div className="zone-only-alerts spc-legend arcgis-legend" role="status" aria-label="Map overlay legend">
            {arcgisSections.map((section) => (
              <div key={section.key} className="arcgis-legend-section">
                <strong>{section.title}</strong>
                {'entries' in section ? (
                  <ul>
                    {section.entries.map((entry) => (
                      <li key={entry.label}>
                        <img className="arcgis-legend-swatch" src={`data:${entry.contentType};base64,${entry.imageData}`} alt="" />
                        {entry.label.replace(/\s+/g, ' ').trim()}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{section.message}</p>
                )}
              </div>
            ))}
          </div>
        ) : null}
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
