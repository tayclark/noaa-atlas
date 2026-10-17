import { GeolocateControl, LngLat, Map as MapLibreMap, Marker, Popup, type CanvasSource, type GeoJSONSource, type LngLatLike, type MapGeoJSONFeature, type MapMouseEvent, type PopupOptions, type RasterTileSource } from 'maplibre-gl'
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
import { selectNode } from '../../data/selectionStore'
import type { ServiceNode } from '../../data/graphSchema'
import type { NwsAlertCollection } from '../../data/nwsSchema'
import type { SpcOutlook } from '../../data/spcSchema'
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
  GOES_CAPABILITIES_URL,
  GOES_FRAMES_REFRESH_MS,
  GOES_LAYER_ID,
  GOES_SOURCE_ID,
  GOES_TILE_URL,
  goesFrameForTime,
  goesLayers,
  goesTileUrl,
  parseGoesFrames,
} from './goesSatelliteLayer'
import { getArcgisLegend } from '../../data/arcgisClient'
import {
  ARCGIS_OVERLAYS,
  arcgisLegendSections,
  arcgisOverlayLayers,
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
  COOPS_LAYER_ID,
  COOPS_RADIUS,
  COOPS_RADIUS_SELECTED,
  coopsRadius,
  coopsStationLayers,
  formatStationLoadingHtml,
  formatStationPopupHtml,
  type StationProperties,
} from './coopsStationsLayer'
import { DART_LAYER_ID, DART_SOURCE_ID, dartStationLayers, dartStationsToGeoJSON, formatDartPopupHtml, type DartProperties } from './dartStationsLayer'
import {
  SPC_FILL_LAYER_ID,
  SPC_LAYER_IDS,
  SPC_SOURCE_ID,
  categoriesInOutlook,
  describeSpcFetchOutcome,
  formatOutlookPopupHtml,
  isOutlookEmpty,
  spcOutlookLayers,
  type SpcCategory,
} from './spcOutlookLayer'
import { NDBC_LAYER_ID, NDBC_SOURCE_ID, ndbcStationLayers, ndbcStationsToGeoJSON, formatNdbcPopupHtml, type NdbcProperties } from './ndbcStationsLayer'
import { NHC_FIX_LAYER_ID, NHC_LAYER_IDS, NHC_SOURCE_ID, nhcTrackLayers } from './nhcTracksLayer'
import { coverageLayers, COVERAGE_SOURCE_ID } from './coverageLayer'
import {
  AURORA_LAYER_ID,
  AURORA_OPACITY,
  AURORA_OPACITY_SELECTED,
  AURORA_SOURCE_ID,
  auroraAt,
  auroraLayers,
  auroraRaster,
  describeSwpcFetchOutcome,
  formatAuroraPopupHtml,
} from './auroraLayer'
import { prefersReducedMotion } from '../prefersReducedMotion'
import { describeKp } from './kpReadout'
import { NOWCOAST_RADAR_TILE_URL, RADAR_LAYER_ID, RADAR_SOURCE_ID, radarLayers, radarTileUrl } from './nowcoastRadarLayer'
import { RadarTimeControl } from './RadarTimeControl'
import { createWaveOverlay, type WaveOverlay } from './waveOverlay'
import { createCanvasShadingOverlay, type CanvasShadingOverlay } from './canvasShadingOverlay'
import { describeReflectivity, REFLECTIVITY_BANDS, reflectivityBlend, reflectivityStep, renderReflectivity } from './reflectivityField'
import type { ScalarFieldInput } from './fieldShading'
import { useReflectivityForecast } from './useReflectivityForecast'
import { describeStormImpact, stormImpactAt, type ImpactAlert } from './stormImpact'
import { createWindOverlay, type WindOverlay } from './windOverlay'
import { useWaveForecast } from './useWaveForecast'
import { useWindForecast } from './useWindForecast'
import { WindControl, type ForecastLayer } from './WindControl'
import { NOWCOAST_CAPABILITIES_URL, frameForTime, parseRadarFrames } from './radarTimes'
import { ForecastTimeline } from './ForecastTimeline'
import { useWmsFrames } from './useWmsFrames'
import { getTimeSnapshot, setTime, stopPlayer, subscribeTime } from '../../data/timeStore'
import { describeCoverageForPopup, formatCoveragePopupHtml } from './coveragePopup'
import { hitBox, hitPadding, isOnGlobe, nearestCandidate } from './hitPick'
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
  ALERTS_FILL_LAYER_ID,
  ALERTS_LINE_LAYER_ID,
  ALERTS_REFRESH_MS,
  ALERTS_RETRY_MS,
  ALERTS_SOURCE_ID,
  alertEmphasis,
  alertLayers,
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
import { clearSelection, subscribeSelection, getSelectionSnapshot, selectPoint } from '../../data/selectionStore'
import { getViewSnapshot, resolveView, subscribeView } from '../../data/viewStore'
import { useNarrowLayout } from '../useNarrowLayout'
import { addLayerGroup, addPointerCursor, setLayersVisible } from './mapLayers'
import { dataOf, errorOf, loadedWith, withEmpty, type AsyncState } from './asyncState'
import { useDebouncedTiles } from './useDebouncedTiles'
import { useLazyStationLayer } from './useLazyStationLayer'
import { usePolledResource } from './usePolledResource'

const spcCategories = (state: AsyncState<SpcOutlook>): AsyncState<SpcCategory[]> =>
  state.status !== 'ok' ? state : isOutlookEmpty(state.data) ? { status: 'empty' } : loadedWith(categoriesInOutlook(state.data))
const NO_ZONE_ALERTS: NwsAlertCollection['features'] = []
const NO_ALERT_POLYGONS: ImpactAlert[] = []
const getPlanetaryKpReadout = () => getPlanetaryKp().then(describeKp)
const isNoStorms = (tracks: StormTrack[]) => tracks.length === 0
const fetchStormTracks = () => getActiveStorms().then(buildStormTracks)

// Beyond this many zone-only alerts, the overlay collapses the rest behind a "N more" toggle
// rather than growing unbounded during a high-volume event (#106).
const ZONE_ONLY_ALERTS_CAP = 5

// Matches the `@container globe (max-width: 480px)` rules in MapLibreGlobe.css (#159).
const NARROW_GLOBE_WIDTH = 480

const RADAR_FRAMES_REFRESH_MS = 5 * 60_000
// Dragging a time slider doesn't refetch tiles for every frame it passes over.

// GFS simulated radar along the forecast part of the storm slider (#340), where no satellite image exists yet.
const REFC_SOURCE_ID = 'gfs-reflectivity'
const REFC_LAYER_ID = 'gfs-reflectivity-raster'
const NO_STORMS: readonly StormTrack[] = []

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
          // A popup closed meanwhile (another tap, Escape, the globe unmounting) is left closed (#354).
          if (popup.isOpen()) popup.setHTML(`${formatPointPopupHtml(describePointForPopup(period, observation))}<hr/>${coverageHtml}`)
        })
      }),
    )
    .catch((err: unknown) => {
      if (popup.isOpen()) popup.setHTML(`${formatPointErrorHtml(describePointError(err))}<hr/>${coverageHtml}`)
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
      if (popup.isOpen()) popup.setHTML(formatStationPopupHtml(station, water, tides))
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
  const [zoneAlertsExpanded, setZoneAlertsExpanded] = useState(false)
  // Starts collapsed to its title bar (#151): a busy day lists hundreds of alerts, which covered
  // half the globe before the user had done anything.
  const [zoneAlertsCollapsed, setZoneAlertsCollapsed] = useState(true)
  const [geolocationError, setGeolocationError] = useState<string | null>(null)
  // Space weather (#54). The grid is kept for click lookups; the cell count also tells the
  // selection effect the aurora layer now exists.
  const ovationRef = useRef<SwpcOvation | null>(null)
  // The buoy lists load the first time their layer is shown (#269): the count once drawn, or 'error'.
  const [arcgisLegends, setArcgisLegends] = useState<Partial<Record<ArcgisOverlay['key'], ArcgisLegendState>>>({})
  // The storm the track control drives, and its scrubbed time; null means the strongest storm and its latest advisory.
  const [stormBin, setStormBin] = useState<string | null>(null)
  const [stormTime, setStormTime] = useState<number | null>(null)
  // The mapped alert polygons, for the hurricane impact check (#344).
  // The impact prompt the reader closed, by point and storm, so it stays closed for that place.
  const [dismissedImpact, setDismissedImpact] = useState<string | null>(null)
  // The radar's chosen frame (#74) comes from the shared time (#228), so the radar and the point
  // forecast timeline scrub together; null follows the latest frame.
  const sharedTime = useSyncExternalStore(subscribeTime, getTimeSnapshot).time
  const windRef = useRef<WindOverlay | null>(null)
  // The alert polygons' current emphasis (#342), read when the alerts layer is first added.
  const alertEmphasisRef = useRef(alertEmphasis([], false))
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
  // The NHC node alone draws its tracks like any live layer. The full storm view (player, imagery,
  // dimmed alerts, camera on the storm) opens only from the impact prompt for a looked-up point (#344),
  // and closes with the layer.
  const nhcShown = liveLayers.includes('nhc-tracks')
  const [stormFocus, setStormFocus] = useState<string | null>(null)
  if (!nhcShown && stormFocus !== null) setStormFocus(null)
  const stormFull = nhcShown && stormFocus !== null
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
    // Set by the cleanup, so a response that lands after the map is removed draws nothing (#354).
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
      // Bottom first. The rasters sit under the storm tracks, the stations and then the alerts and
      // aurora, which arrive later and go on top. Hidden layers fetch no tiles.
      addLayerGroup(map, coverageLayers())
      addLayerGroup(map, radarLayers())
      // The wind overlay (#229) draws over the radar and under the stations and alerts; it stays
      // hidden, and requests nothing, until the GFS node is selected.
      windRef.current = createWindOverlay(map, prefersReducedMotion())
      waveRef.current = createWaveOverlay(map)
      // The SPC outlook (#245) over the wind, then the ArcGIS overlays (#247) in table order (#288).
      addLayerGroup(map, spcOutlookLayers())
      for (const overlay of ARCGIS_OVERLAYS) addLayerGroup(map, arcgisOverlayLayers(overlay))
      // The storm view (#334, #338, #340): satellite or simulated radar under the tracks.
      addLayerGroup(map, goesLayers())
      reflectivityRef.current = createCanvasShadingOverlay(map, {
        sourceId: REFC_SOURCE_ID,
        layerId: REFC_LAYER_ID,
        size: 1024,
        opacity: 0.9,
        render: renderReflectivity,
      })
      addLayerGroup(map, nhcTrackLayers())
      // CO-OPS stations are static, so their layer needs no fetch; the buoys load when first shown.
      addLayerGroup(map, coopsStationLayers(COOPS_STATIONS))
      addLayerGroup(map, dartStationLayers())
      addLayerGroup(map, ndbcStationLayers())
      addPointerCursor(map, STATION_LAYER_IDS)
      setMapLoaded(true)

      // Every tap or click on the map (#39, #51, #78). One handler decides what it meant, so only one
      // popup opens: a station if one is near (a fingertip can't aim at a 6px dot, so the query is a
      // padded box and the nearest dot wins), else an alert polygon under the point, else an SPC
      // outlook area, else a forecast and coverage lookup there. Alerts and outlook areas also
      // select the point. Layers that aren't drawn yet are skipped. A click in the space around
      // the globe selects nothing: it closes the popup and clears the selection.
      let lastClickAt = -Infinity
      map.on('click', (e: MapMouseEvent) => {
        const at = e.originalEvent.timeStamp
        const isEcho = at - lastClickAt < DOUBLE_CLICK_MS
        lastClickAt = at
        if (isEcho) return

        if (!isOnGlobe(e.point, map.project(e.lngLat))) {
          openPopup?.remove()
          clearSelection()
          return
        }

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
      waveRef.current?.dispose()
      waveRef.current = null
      reflectivityRef.current?.dispose()
      reflectivityRef.current = null
      // The popup is module-level, so it would outlive the map, and Escape would still find it (#354).
      openPopup?.remove()
      openPopup = null
      map.remove()
    }
  }, [])

  // Reacts to the selection (#44, #149): draws its coverage footprint, flies to it, and
  // emphasises the live layers its services drive (#54). Gated on mapLoaded since the source,
  // fitBounds and setPaintProperty all require a loaded style.
  const emphasis = useMemo(() => alertEmphasis(liveLayers, stormFull), [liveLayers, stormFull])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    map.getSource<GeoJSONSource>(COVERAGE_SOURCE_ID)?.setData(view.footprint)

    // Alerts that load after this keep the same emphasis: the layer reads the ref when it is added.
    alertEmphasisRef.current = emphasis
    if (map.getLayer(ALERTS_FILL_LAYER_ID)) {
      map.setPaintProperty(ALERTS_FILL_LAYER_ID, 'fill-opacity', emphasis.fillOpacity)
      map.setPaintProperty(ALERTS_LINE_LAYER_ID, 'line-width', emphasis.lineWidth)
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
  }, [view, mapLoaded, emphasis, active])

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

  // The aurora forecast and Kp are re-fetched every few minutes while the globe is looked at, and at
  // once on return when stale (#78). A failed refresh keeps what is on screen; only a failed first
  // load shows an error.
  const swpcOptions = { describeError: describeSwpcFetchOutcome }
  const polledAurora = usePolledResource(mapLoaded, active, getOvationAurora, SWPC_REFRESH_MS, swpcOptions)
  const polledKp = usePolledResource(mapLoaded, active, getPlanetaryKpReadout, SWPC_REFRESH_MS, swpcOptions)
  const kp = polledKp
  const auroraError = errorOf(polledAurora)
  const ovation = dataOf(polledAurora)
  const auroraRasterData = useMemo(() => (ovation ? auroraRaster(ovation) : null), [ovation])
  const auroraCells = auroraRasterData?.cells ?? null
  const auroraCanvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !ovation || !auroraRasterData) return
    ovationRef.current = ovation
    const raster = auroraRasterData
    const source = map.getSource(AURORA_SOURCE_ID) as CanvasSource | undefined
    if (!source || !auroraCanvasRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = raster.width
      canvas.height = raster.height
      canvas.getContext('2d')?.putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0)
      auroraCanvasRef.current = canvas
      // Under the alerts if they're already drawn; if they arrive later they're added on top anyway.
      addLayerGroup(map, auroraLayers(canvas), map.getLayer(ALERTS_FILL_LAYER_ID) ? ALERTS_FILL_LAYER_ID : undefined)
    } else {
      auroraCanvasRef.current.getContext('2d')?.putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0)
      // A non-animated canvas source only uploads its texture on load; play() then pause()
      // uploads the redrawn canvas once.
      source.play()
      source.pause()
      map.triggerRepaint()
    }
  }, [ovation, auroraRasterData, mapLoaded])

  // The aurora's emphasis (#54) lives apart from the effect above so that the layer arriving
  // (auroraCells) re-applies it without re-framing the globe.
  const auroraHighlighted = liveLayers.includes('aurora')
  useEffect(() => {
    const map = mapRef.current
    if (!map || auroraCells === null || !map.getLayer(AURORA_LAYER_ID)) return
    map.setPaintProperty(AURORA_LAYER_ID, 'raster-opacity', auroraHighlighted ? AURORA_OPACITY_SELECTED : AURORA_OPACITY)
  }, [auroraHighlighted, auroraCells])

  // The alerts are refreshed on the same terms as space weather (#222), and a failed first load is
  // retried sooner, until it succeeds. A failed refresh keeps the last good alerts on screen.
  const polledAlerts = usePolledResource(mapLoaded, active, getActiveAlerts, ALERTS_REFRESH_MS, {
    describeError: describeAlertsFetchOutcome,
    retryMs: ALERTS_RETRY_MS,
  })
  const alertSplit = useMemo(() => {
    const alerts = dataOf(polledAlerts)
    return alerts ? splitAlertsByGeometry(alerts) : null
  }, [polledAlerts])
  const zoneOnlyAlerts = alertSplit?.zoneOnly ?? NO_ZONE_ALERTS
  const alertPolygons = useMemo<ImpactAlert[]>(
    () => alertSplit?.mappable.features.map((f) => ({ event: f.properties.event, geometry: f.geometry })) ?? NO_ALERT_POLYGONS,
    [alertSplit],
  )
  const alertsStatus = alertSplit
    ? alertSplit.mappable.features.length === 0 && alertSplit.zoneOnly.length === 0
      ? 'empty'
      : 'ok'
    : polledAlerts.status
  const alertsErrorMessage = errorOf(polledAlerts)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !alertSplit) return
    const existing = map.getSource<GeoJSONSource>(ALERTS_SOURCE_ID)
    if (existing) {
      existing.setData(alertSplit.mappable)
      return
    }
    addLayerGroup(map, alertLayers(alertSplit.mappable, alertEmphasisRef.current))
    addPointerCursor(map, [ALERTS_FILL_LAYER_ID])
  }, [alertSplit, mapLoaded])

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
    if (map && mapLoaded) setLayersVisible(map, [RADAR_LAYER_ID], radarShown)
  }, [radarShown, mapLoaded])

  // The radar's frame list (#74) is fetched while the layer is shown, and refreshed as frames age
  // out for as long as the globe is looked at (#78). A failed fetch leaves the latest-frame layer
  // without a slider. Leaving resets to latest (#286): the shared time returns to now and a radar
  // loop stops, so the point timeline and the wind also start from now after the radar goes.
  const radarFrames = useWmsFrames(NOWCOAST_CAPABILITIES_URL, parseRadarFrames, radarShown, active, RADAR_FRAMES_REFRESH_MS)
  const radarTime = useMemo(() => frameForTime(radarFrames, sharedTime), [radarFrames, sharedTime])
  useEffect(() => {
    if (!radarShown) return
    return () => {
      stopPlayer('radar')
      setTime(null)
    }
  }, [radarShown])

  // Seen again after being hidden: MapLibre's own resize observer is throttled, so say so at once.
  useEffect(() => {
    if (active) mapRef.current?.resize()
  }, [active])

  // Point the source at the chosen frame. Debounced so dragging the slider doesn't refetch tiles
  // for every frame it passes over.
  useDebouncedTiles(mapRef, mapLoaded, RADAR_SOURCE_ID, NOWCOAST_RADAR_TILE_URL, radarShown ? radarTileUrl(radarTime) : null)

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
  // list loads the first time they're shown (#269); a failed load is forgotten once they're hidden,
  // so the next select tries again (#354).
  const dartShown = liveLayers.includes('dart-stations')
  const dartStations = useLazyStationLayer(mapRef, mapLoaded, dartShown, DART_LAYER_ID, DART_SOURCE_ID, loadDartStations, dartStationsToGeoJSON)

  // The SPC outlook (#245) is fetched only while its node is selected, and refreshed while the globe
  // is looked at, at once on return if it is stale. A failed refresh keeps the polygons already
  // drawn. Hiding it clears them and its status, so the next show starts from loading (#354).
  const spcShown = liveLayers.includes('spc-outlook')
  const polledSpc = usePolledResource(mapLoaded && spcShown, active, getDay1CategoricalOutlook, SPC_REFRESH_MS, {
    describeError: describeSpcFetchOutcome,
  })
  const spc = useMemo(() => spcCategories(polledSpc), [polledSpc])
  const spcOutlook = dataOf(polledSpc)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    setLayersVisible(map, SPC_LAYER_IDS, spcShown)
    // No outlook (hidden, loading or failed first) leaves the layer empty; a failed refresh keeps it.
    map.getSource<GeoJSONSource>(SPC_SOURCE_ID)?.setData(spcOutlook ?? { type: 'FeatureCollection', features: [] })
  }, [spcShown, spcOutlook, mapLoaded])

  // The NHC storm tracks (#334), like the SPC outlook: fetched only while the node is selected, or
  // while a point is selected so the impact prompt can check it (#344), and refreshed while the globe
  // is looked at. A failed refresh keeps the tracks already drawn; no longer wanted, they and their
  // status are forgotten (#354).
  const stormsWanted = nhcShown || selection.selectedPoint !== null
  useEffect(() => {
    const map = mapRef.current
    if (map && mapLoaded) setLayersVisible(map, NHC_LAYER_IDS, nhcShown)
  }, [nhcShown, mapLoaded])
  const polledStorms = usePolledResource(stormsWanted, active, fetchStormTracks, NHC_REFRESH_MS, {
    describeError: describeNhcFetchOutcome,
  })
  const storms = useMemo(() => withEmpty(polledStorms, isNoStorms), [polledStorms])

  const stormTracks = storms.status === 'ok' ? storms.data : NO_STORMS
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

  // The impact prompt (#344): a looked-up point inside a storm's cone or under a tropical watch or
  // warning offers the full storm view, unless it is already open on that storm or was closed here.
  const point = selection.selectedPoint
  const impact = useMemo(() => (point ? stormImpactAt(point, stormTracks, alertPolygons) : null), [point, stormTracks, alertPolygons])
  const impactKey = impact && point ? `${point.join(',')}:${impact.bin}` : null
  const impactPrompt = impact && !(stormFull && stormFocus === impact.bin) && dismissedImpact !== impactKey ? describeStormImpact(impact) : null
  const openStormView = useCallback(() => {
    if (!impact) return
    // The reader moves from the place to the storm, so the place's popup would only cover the player.
    openPopup?.remove()
    setStormFocus(impact.bin)
    setStormBin(impact.bin)
    setStormTime(null)
    selectNode('nhc-active-storms')
  }, [impact])

  // Redraws the tracks, with the chosen storm's trail and marker at the scrubbed time.
  const stormFrameTime = stormFrames[stormIndex] ?? null
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !nhcShown) return
    // Without the full view every storm is drawn alike, with no marker.
    map.getSource<GeoJSONSource>(NHC_SOURCE_ID)?.setData(
      stormFull ? trackFeatures(stormTracks, storm?.bin ?? null, stormFrameTime) : trackFeatures(stormTracks, null, null),
    )
  }, [stormTracks, storm, stormFrameTime, nhcShown, stormFull, mapLoaded])

  // The GOES frame list (#338) is read while the tracks are shown and refreshed as frames arrive. A
  // failed read leaves the latest image, which needs no list. The image follows the storm slider
  // inside the archive and is the latest one outside it; debounced like the radar.
  const goesFrames = useWmsFrames(GOES_CAPABILITIES_URL, parseGoesFrames, stormFull, active, GOES_FRAMES_REFRESH_MS)
  const goesFrame = goesFrameForTime(goesFrames, stormFrameTime)
  // Past the advisory there is no satellite image of the storm yet, so the GFS simulated radar takes
  // its place. The first forecast step is loaded while the slider is still before the advisory.
  const stormInForecast = stormFull && storm !== null && stormFrameTime !== null && stormFrameTime > storm.advisoryTime
  const reflectivityTime = storm ? Math.max(stormFrameTime ?? storm.advisoryTime, storm.advisoryTime) : null
  const reflectivity = useReflectivityForecast(stormFull && storm !== null, reflectivityTime === null ? null : reflectivityStep(reflectivityTime))
  const reflectivityPair = reflectivity.status === 'idle' ? null : reflectivity.field
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    setLayersVisible(map, [GOES_LAYER_ID], stormFull && !stormInForecast)
    reflectivityRef.current?.setVisible(stormInForecast)
  }, [stormFull, stormInForecast, mapLoaded])
  useEffect(() => {
    if (!mapLoaded || !stormInForecast || reflectivityTime === null) return
    reflectivityRef.current?.setField(reflectivityPair && { a: reflectivityPair.a, b: reflectivityPair.b, t: reflectivityBlend(reflectivityTime) })
  }, [reflectivityPair, reflectivityTime, stormInForecast, mapLoaded])
  useDebouncedTiles(mapRef, mapLoaded, GOES_SOURCE_ID, GOES_TILE_URL, stormFull ? goesTileUrl(goesFrame) : null)

  // In the full view, frames the chosen storm when its tracks first arrive and whenever another storm is chosen.
  const framedStormRef = useRef<string | null>(null)
  useEffect(() => {
    if (!stormFull) {
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
  }, [storm, stormFull, mapLoaded, active])

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
    for (const overlay of ARCGIS_OVERLAYS) setLayersVisible(map, [overlay.layerId], overlays.includes(overlay))
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

  // The NDBC buoys load the first time they're shown too (#269), and retry like the DART ones.
  const ndbcShown = liveLayers.includes('ndbc-stations')
  const ndbcStations = useLazyStationLayer(mapRef, mapLoaded, ndbcShown, NDBC_LAYER_ID, NDBC_SOURCE_ID, loadNdbcStations, ndbcStationsToGeoJSON)

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
        data-alerts-emphasis={emphasis.level}
        data-nhc-tracks={mapLoaded ? (nhcShown ? storms.status : 'hidden') : undefined}
        data-nhc-view={nhcShown ? (stormFull ? 'full' : 'static') : undefined}
        data-nhc-storm={stormFull && storm ? storm.bin : undefined}
        data-goes-time={stormFull && !stormInForecast ? (goesFrame ?? 'latest') : undefined}
        data-gfs-reflectivity={stormFull ? (stormInForecast && reflectivity.status !== 'idle' ? reflectivity.status : 'hidden') : undefined}
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
        {impactPrompt && impactKey && (
          <div className="zone-only-alerts storm-prompt" role="region" aria-label="Storm may affect this location">
            <strong>{impactPrompt.title}</strong>
            <p>{impactPrompt.reason}</p>
            <div className="storm-prompt-actions">
              <button type="button" className="radar-time-step storm-prompt-show" onClick={openStormView}>
                Show storm track
              </button>
              <button type="button" className="radar-time-step" onClick={() => setDismissedImpact(impactKey)}>
                Not now
              </button>
            </div>
          </div>
        )}
        {stormFull && storm && stormFrames.length > 1 && (
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
              {categoriesInTracks(storms.data).map((category) => (
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
              {spc.data.map((category) => (
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
                <strong>Kp {kp.data.kp}</strong> · {kp.data.gScale} {kp.data.label}{' '}
                <span className="space-weather-readout-time">{kp.data.time}</span>
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
