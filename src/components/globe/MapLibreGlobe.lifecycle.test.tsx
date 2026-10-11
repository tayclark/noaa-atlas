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
import { clearSwpcCache } from '../../data/swpcClient'
import { clearNwsCache } from '../../data/nwsClient'
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
  layers = new Set<string>()
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
  addSource(id: string) {
    this.record('addSource')
    this.sources.set(id, new StubSource())
  }
  addLayer(layer: { id: string }) {
    this.record('addLayer')
    this.layers.add(layer.id)
  }
  getSource(id: string) {
    return this.sources.get(id)
  }
  getLayer(id: string) {
    return this.layers.has(id) ? { id } : undefined
  }
  setLayoutProperty() {
    this.record('setLayoutProperty')
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
})
