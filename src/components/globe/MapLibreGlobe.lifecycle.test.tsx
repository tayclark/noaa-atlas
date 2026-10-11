// @vitest-environment jsdom
// The globe's lifecycle (#354): what it fetches, polls and draws as layers are shown and hidden, the
// tab is switched and the globe unmounts. MapLibre is a stub that records calls, so these cover the
// wrapper's bookkeeping, not drawing, which the e2e specs cover.
import { act, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNarrowLayout, unmockNarrowLayout } from '../narrowLayoutTestUtils'
import { clearSelection, selectNode } from '../../data/selectionStore'
import { clearView, showView } from '../../data/viewStore'
import { clearSpcCache, SPC_REFRESH_MS } from '../../data/spcClient'
import { clearNhcCache, NHC_REFRESH_MS } from '../../data/nhcClient'
import { clearSwpcCache, SWPC_REFRESH_MS } from '../../data/swpcClient'
import { clearNwsCache } from '../../data/nwsClient'
import { makeAlertCollection } from '../../data/nwsFixtures'
import { makeKp1m, makeOvation } from '../../data/swpcFixtures'
import { ALERTS_REFRESH_MS, ALERTS_RETRY_MS } from './nwsAlertsLayer'
import { loadDartStations } from '../../data/dartStations'
import { loadNdbcStations } from '../../data/ndbcStations'

type Handler = (...args: unknown[]) => void

const maps: StubMap[] = []
const popups: StubPopup[] = []

class StubSource {
  setData = vi.fn()
  setTiles = vi.fn()
  play = vi.fn()
  pause = vi.fn()
}

class StubMap {
  removed = false
  handlers = new Map<string, Handler[]>()
  sources = new Map<string, StubSource>()
  /** Each source's spec as it was added, by id. */
  sourceSpecs = new Map<string, Record<string, unknown>>()
  layers = new Set<string>()
  /** The layers bottom to top, as MapLibre would stack them given each add's beforeId. */
  order: string[] = []
  /** Each layer's current visibility. */
  visibility = new Map<string, string>()
  canvas = document.createElement('canvas')
  container: HTMLElement
  touchZoomRotate = { disableRotation: vi.fn() }
  /** Every call that changes the map, by name, so a test can tell whether a dead map was touched. */
  calls: string[] = []

  constructor({ container }: { container: HTMLElement }) {
    this.container = container
    maps.push(this)
  }
  private record(name: string) {
    this.calls.push(name)
  }
  on(event: string, layerOrHandler: string | Handler, handler?: Handler) {
    const key = typeof layerOrHandler === 'string' ? `${event}:${layerOrHandler}` : event
    const list = this.handlers.get(key) ?? []
    list.push((typeof layerOrHandler === 'string' ? handler : layerOrHandler)!)
    this.handlers.set(key, list)
  }
  fire(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }
  addControl = vi.fn()
  addSource(id: string, spec: Record<string, unknown>) {
    this.record('addSource')
    this.sources.set(id, new StubSource())
    this.sourceSpecs.set(id, spec)
  }
  addLayer(layer: { id: string; layout?: { visibility?: string } }, beforeId?: string) {
    this.record('addLayer')
    this.layers.add(layer.id)
    const at = beforeId === undefined ? -1 : this.order.indexOf(beforeId)
    if (at === -1) this.order.push(layer.id)
    else this.order.splice(at, 0, layer.id)
    this.visibility.set(layer.id, layer.layout?.visibility ?? 'visible')
  }
  getSource(id: string) {
    return this.sources.get(id)
  }
  getLayer(id: string) {
    return this.layers.has(id) ? { id } : undefined
  }
  setLayoutProperty(id: string, name: string, value: string) {
    this.record('setLayoutProperty')
    if (name === 'visibility') this.visibility.set(id, value)
  }
  setPaintProperty() {
    this.record('setPaintProperty')
  }
  setProjection = vi.fn()
  triggerRepaint = vi.fn()
  resize = vi.fn()
  remove() {
    this.removed = true
  }
  getCanvas() {
    return this.canvas
  }
  getContainer() {
    return this.container
  }
  project() {
    return { x: 100, y: 100 }
  }
  getCenter() {
    return { lng: -95, lat: 38 }
  }
  getZoom() {
    return 3
  }
  queryRenderedFeatures() {
    return []
  }
  jumpTo = vi.fn()
  flyTo = vi.fn()
  fitBounds = vi.fn()
}

class StubPopup {
  open = false
  handlers: Record<string, Handler[]> = {}
  setHTML = vi.fn(() => this)
  constructor() {
    popups.push(this)
  }
  setLngLat() {
    return this
  }
  getLngLat() {
    return { lng: -95, lat: 38 }
  }
  addTo() {
    this.open = true
    return this
  }
  isOpen() {
    return this.open
  }
  getElement() {
    return document.createElement('div')
  }
  on(event: string, handler: Handler) {
    ;(this.handlers[event] ??= []).push(handler)
    return this
  }
  remove = vi.fn(() => {
    if (!this.open) return this
    this.open = false
    for (const handler of this.handlers.close ?? []) handler()
    return this
  })
}

vi.mock('maplibre-gl', () => ({
  Map: StubMap,
  Popup: StubPopup,
  Marker: class {
    setLngLat() {
      return this
    }
    addTo() {
      return this
    }
    remove() {}
  },
  GeolocateControl: class {
    on = vi.fn()
    trigger = vi.fn()
  },
  LngLat: { convert: (lngLat: unknown) => lngLat },
}))


vi.mock('../../data/dartStations', () => ({ loadDartStations: vi.fn() }))
vi.mock('../../data/ndbcStations', () => ({ loadNdbcStations: vi.fn() }))

const { MapLibreGlobe } = await import('./MapLibreGlobe')

/** Every fetch waits until the test answers it; `answer` settles the ones whose URL matches. */
interface PendingFetch {
  url: string
  resolve: (res: Response) => void
  reject: (err: unknown) => void
}
let pending: PendingFetch[] = []
const fetched = (part: string) => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes(part)).length
async function answer(part: string, respond: () => Response | Error) {
  const matching = pending.filter((p) => p.url.includes(part))
  pending = pending.filter((p) => !p.url.includes(part))
  await act(async () => {
    for (const p of matching) {
      const outcome = respond()
      if (outcome instanceof Error) p.reject(outcome)
      else p.resolve(outcome)
    }
  })
}

const SWPC = 'services.swpc.noaa.gov'
const ALERTS = 'api.weather.gov/alerts'
const SPC = 'www.spc.noaa.gov'
const NHC = 'NHC_tropical_weather_summary'

function renderGlobe() {
  const result = render(<MapLibreGlobe />)
  const map = maps[maps.length - 1]!
  act(() => map.fire('load'))
  const globe = () => result.container.querySelector('[aria-label="Globe view of NOAA API coverage"]')!
  return { ...result, map, globe }
}

beforeAll(() => {
  // jsdom has no 2D canvas; the overlays skip their drawing without one.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

beforeEach(() => {
  maps.length = 0
  popups.length = 0
  pending = []
  clearView()
  clearSpcCache()
  clearNhcCache()
  clearSwpcCache()
  clearNwsCache()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          pending.push({ url: String(url), resolve, reject })
        }),
    ),
  )
})

afterEach(() => {
  unmockNarrowLayout()
  clearSelection()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const clickGlobe = (map: StubMap) =>
  act(() => map.fire('click', { originalEvent: { timeStamp: 1000 }, point: { x: 100, y: 100 }, lngLat: { lng: -95, lat: 38 } }))

describe('MapLibreGlobe lifecycle (#354)', () => {
  it('a space weather or alerts response after unmount touches no map', async () => {
    const { map, unmount } = renderGlobe()
    expect(fetched(SWPC)).toBeGreaterThan(0)
    expect(fetched(ALERTS)).toBe(1)
    unmount()
    expect(map.removed).toBe(true)
    const before = map.calls.length
    await answer(SWPC, () => new Response('[]'))
    await answer(ALERTS, () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [] })))
    expect(map.calls.slice(before)).toEqual([])
  })

  it('unmounting closes the open popup, and a lookup that lands later leaves it closed', async () => {
    const { map, unmount } = renderGlobe()
    clickGlobe(map)
    const popup = popups[popups.length - 1]!
    expect(popup.isOpen()).toBe(true)
    const htmlCalls = popup.setHTML.mock.calls.length
    unmount()
    expect(popup.remove).toHaveBeenCalled()
    expect(popup.isOpen()).toBe(false)
    await answer('api.weather.gov/points', () => new Error('offline'))
    expect(popup.setHTML.mock.calls.length).toBe(htmlCalls)
  })

  it('a point lookup that lands after its popup was closed leaves it alone', async () => {
    const { map } = renderGlobe()
    clickGlobe(map)
    const popup = popups[popups.length - 1]!
    const htmlCalls = popup.setHTML.mock.calls.length
    act(() => void popup.remove())
    await answer('api.weather.gov/points', () => new Error('offline'))
    expect(popup.setHTML.mock.calls.length).toBe(htmlCalls)
  })

  it.each([
    ['SPC outlook', 'spc-gis-data', SPC, SPC_REFRESH_MS],
    ['storm tracks', 'nhc-active-storms', NHC, NHC_REFRESH_MS],
  ])('polls the %s only while the globe tab is looked at', async (_, node, host, refreshMs) => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    // jsdom reports a hidden document, which pollWhileVisible skips.
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    mockNarrowLayout(true)
    showView('globe')
    renderGlobe()
    act(() => selectNode(node))
    // Settled each time, so a poll can't simply join the request still in flight.
    await answer(host, () => new Response(null, { status: 503 }))
    const first = fetched(host)
    act(() => vi.advanceTimersByTime(refreshMs))
    expect(fetched(host)).toBeGreaterThan(first)
    await answer(host, () => new Response(null, { status: 503 }))

    act(() => showView('graph'))
    const hidden = fetched(host)
    act(() => vi.advanceTimersByTime(refreshMs * 3))
    expect(fetched(host)).toBe(hidden)
  })

  it('a hidden SPC outlook forgets its polygons and status, so it shows as loading when shown again', async () => {
    const { map, globe } = renderGlobe()
    act(() => selectNode('spc-gis-data'))
    await answer(SPC, () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [] })))
    expect(globe().getAttribute('data-spc-outlook')).toBe('empty')
    act(() => selectNode('nws-api'))
    expect(map.getSource('spc-outlook')!.setData).toHaveBeenLastCalledWith({ type: 'FeatureCollection', features: [] })
    clearSpcCache()
    act(() => selectNode('spc-gis-data'))
    expect(globe().getAttribute('data-spc-outlook')).toBe('loading')
    // With nothing drawn, a failed first load on this show is an error, not hidden behind old polygons.
    await answer(SPC, () => new Response(null, { status: 503 }))
    expect(globe().getAttribute('data-spc-outlook')).toBe('error')
    act(() => selectNode('nws-api'))
    act(() => selectNode('spc-gis-data'))
    expect(globe().getAttribute('data-spc-outlook')).toBe('loading')
  })

  it('hidden storm tracks forget their failure, so they show as loading when shown again', async () => {
    const { globe } = renderGlobe()
    act(() => selectNode('nhc-active-storms'))
    await answer(NHC, () => new Response(null, { status: 503 }))
    expect(globe().getAttribute('data-nhc-tracks')).toBe('error')
    act(() => selectNode('nws-api'))
    act(() => selectNode('nhc-active-storms'))
    expect(globe().getAttribute('data-nhc-tracks')).toBe('loading')
  })

  it('retries the DART and NDBC buoy lists on a later select after a failure', async () => {
    vi.mocked(loadDartStations).mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValueOnce([])
    vi.mocked(loadNdbcStations).mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValueOnce([])
    const { globe } = renderGlobe()
    for (const [node, attribute] of [
      ['ndbc-dart-realtime', 'data-dart-stations'],
      ['ndbc-realtime', 'data-ndbc-stations'],
    ] as const) {
      await act(async () => selectNode(node))
      expect(globe().getAttribute(attribute)).toBe('error')
      act(() => selectNode('nws-api'))
      await act(async () => selectNode(node))
      expect(globe().getAttribute(attribute)).toBe('0')
    }
  })

  // The z-order every layer module's specs must keep (#354): bottom first, the overlays' canvases in
  // their slots, and the alerts and aurora on top when they arrive.
  const LOAD_ORDER = [
    'selected-coverage-fill',
    'selected-coverage-line',
    'nowcoast-radar-raster',
    'wind-shading-raster',
    'wind-particles-raster',
    'wave-shading-raster',
    'spc-outlook-fill',
    'spc-outlook-line',
    'arcgis-charts-layer',
    'arcgis-raster-layer',
    'arcgis-vector-layer',
    'arcgis-habitat-layer',
    'goes-satellite-raster',
    'gfs-reflectivity-raster',
    'nhc-tracks-cone-fill',
    'nhc-tracks-cone-line',
    'nhc-tracks-past',
    'nhc-tracks-forecast',
    'nhc-tracks-trail-casing',
    'nhc-tracks-trail',
    'nhc-tracks-fix',
    'nhc-tracks-marker',
    'coops-stations-circle',
    'dart-stations-circle',
    'ndbc-stations-circle',
  ]
  const json = (body: unknown) => () => new Response(JSON.stringify(body))

  it('stacks its layers in a fixed order, the aurora going under alerts that arrived first', async () => {
    const { map } = renderGlobe()
    expect(map.order).toEqual(LOAD_ORDER)
    await answer(ALERTS, json(makeAlertCollection([])))
    expect(map.order).toEqual([...LOAD_ORDER, 'nws-alerts-fill', 'nws-alerts-line'])
    await answer('planetary_k_index', json(makeKp1m()))
    await answer('ovation_aurora', json(makeOvation()))
    expect(map.order).toEqual([...LOAD_ORDER, 'swpc-aurora-raster', 'nws-alerts-fill', 'nws-alerts-line'])
  })

  it('stacks alerts that arrive after the aurora on top of it', async () => {
    const { map } = renderGlobe()
    await answer('ovation_aurora', json(makeOvation()))
    await answer(ALERTS, json(makeAlertCollection([])))
    expect(map.order).toEqual([...LOAD_ORDER, 'swpc-aurora-raster', 'nws-alerts-fill', 'nws-alerts-line'])
  })

  it('shows a pointer over the stations and the alerts', async () => {
    const { map } = renderGlobe()
    await answer(ALERTS, json(makeAlertCollection([])))
    for (const layer of ['coops-stations-circle', 'dart-stations-circle', 'ndbc-stations-circle', 'nws-alerts-fill']) {
      map.fire(`mouseenter:${layer}`)
      expect(map.canvas.style.cursor).toBe('pointer')
      map.fire(`mouseleave:${layer}`)
      expect(map.canvas.style.cursor).toBe('')
    }
  })

  it.each([
    ['nowcoast-map-services', ['nowcoast-radar-raster']],
    ['spc-gis-data', ['spc-outlook-fill', 'spc-outlook-line']],
    ['ndbc-dart-realtime', ['dart-stations-circle']],
    ['ndbc-realtime', ['ndbc-stations-circle']],
    ['nws-raster-map-services', ['arcgis-raster-layer']],
    [
      'nhc-active-storms',
      [
        'nhc-tracks-cone-fill',
        'nhc-tracks-cone-line',
        'nhc-tracks-past',
        'nhc-tracks-forecast',
        'nhc-tracks-trail-casing',
        'nhc-tracks-trail',
        'nhc-tracks-fix',
        'nhc-tracks-marker',
      ],
    ],
  ])('shows the layers of %s only while it is selected', async (node, layers) => {
    vi.mocked(loadDartStations).mockResolvedValue([])
    vi.mocked(loadNdbcStations).mockResolvedValue([])
    const { map } = renderGlobe()
    // Its siblings (the other ArcGIS overlays, say) stay hidden.
    const shown = () => LOAD_ORDER.filter((id) => map.visibility.get(id) !== 'none' && id.startsWith(layers[0]!.split('-')[0]!))
    for (const id of layers) expect(map.visibility.get(id)).toBe('none')
    await act(async () => selectNode(node))
    for (const id of layers) expect(map.visibility.get(id)).toBe('visible')
    expect(shown()).toEqual(layers.filter((id) => !id.startsWith('selected-')))
    await act(async () => selectNode('nws-api'))
    for (const id of layers) expect(map.visibility.get(id)).toBe('none')
  })

  it('retries a failed first alerts load sooner, and keeps the alerts when a later refresh fails', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { container } = renderGlobe()
    const status = () => container.querySelector('[aria-label="Alerts status"]')?.textContent ?? null
    await answer(ALERTS, () => new Response(null, { status: 503 }))
    expect(status()).not.toBeNull()
    expect(status()).not.toBe('No active alerts.')
    act(() => vi.advanceTimersByTime(ALERTS_RETRY_MS))
    expect(fetched(ALERTS)).toBe(2)
    await answer(ALERTS, json(makeAlertCollection([])))
    expect(status()).toBe('No active alerts.')
    // No more fast retries once loaded; the normal refresh fails and the alerts stay.
    clearNwsCache()
    act(() => vi.advanceTimersByTime(ALERTS_RETRY_MS))
    expect(fetched(ALERTS)).toBe(2)
    act(() => vi.advanceTimersByTime(ALERTS_REFRESH_MS))
    expect(fetched(ALERTS)).toBe(3)
    await answer(ALERTS, () => new Response(null, { status: 503 }))
    expect(status()).toBe('No active alerts.')
  })

  it('shows a space weather error only until the first good load, then keeps it through failed refreshes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { container, globe } = renderGlobe()
    const readout = () => container.querySelector('[aria-label="Geomagnetic activity"]')?.textContent ?? null
    expect(readout()).toBeNull()
    await answer('planetary_k_index', () => new Response(null, { status: 503 }))
    await answer('ovation_aurora', () => new Response(null, { status: 503 }))
    expect(readout()).toContain('Aurora forecast:')
    expect(globe().getAttribute('data-aurora-cells')).toBeNull()
    clearSwpcCache()
    act(() => vi.advanceTimersByTime(SWPC_REFRESH_MS))
    await answer('planetary_k_index', json(makeKp1m()))
    await answer('ovation_aurora', json(makeOvation()))
    expect(readout()).toContain('Kp 3')
    expect(readout()).not.toContain('Aurora forecast:')
    expect(globe().getAttribute('data-aurora-cells')).toBe('2')
    clearSwpcCache()
    act(() => vi.advanceTimersByTime(SWPC_REFRESH_MS))
    await answer(SWPC, () => new Response(null, { status: 503 }))
    expect(readout()).toContain('Kp 3')
    expect(readout()).not.toContain('Aurora forecast:')
    expect(globe().getAttribute('data-aurora-cells')).toBe('2')
  })

  it('brightens the aurora while its node is selected', async () => {
    const { map } = renderGlobe()
    const paint = vi.spyOn(map, 'setPaintProperty')
    await answer('ovation_aurora', json(makeOvation()))
    expect(paint).toHaveBeenLastCalledWith('swpc-aurora-raster', 'raster-opacity', 0.75)
    act(() => selectNode('swpc-ovation-aurora'))
    expect(paint).toHaveBeenLastCalledWith('swpc-aurora-raster', 'raster-opacity', 1)
  })
})
