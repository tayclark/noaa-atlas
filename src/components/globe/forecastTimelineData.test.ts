import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCoopsCache } from '../../data/coopsClient'
import { makeCoopsError, makeHourlyPredictions } from '../../data/coopsFixtures'
import { clearNwsCache } from '../../data/nwsClient'
import { makeGridpointData, makePoint } from '../../data/nwsFixtures'
import { coopsDate, loadForecastTimeline } from './forecastTimelineData'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

/** Routes the three endpoints by URL; `tides` is what the CO-OPS call answers. */
function route(tides: () => Response, grid: unknown = makeGridpointData()) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes('/points/')) return json(makePoint())
    if (url.includes('/gridpoints/')) return json(grid)
    return tides()
  })
}

const COASTAL: [number, number] = [-122.4, 37.8]
const INLAND: [number, number] = [-95.7, 39.1]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearNwsCache()
  clearCoopsCache()
})
afterEach(() => vi.unstubAllGlobals())

describe('coopsDate', () => {
  it('formats a UTC day as YYYYMMDD', () => {
    expect(coopsDate(Date.parse('2026-10-01T23:30:00Z'))).toBe('20261001')
  })
})

describe('loadForecastTimeline', () => {
  it('loads wind, waves and the nearest station tide curve', async () => {
    route(() => json(makeHourlyPredictions()))
    const data = await loadForecastTimeline(COASTAL)
    expect(data.series).toHaveLength(3)
    expect(data.station).toMatchObject({ id: expect.any(String), name: expect.any(String) })
    expect(data.tides).toHaveLength(3)
    expect(data.tideMessage).toBeNull()
    const coops = vi.mocked(fetch).mock.calls.map((c) => String(c[0])).find((u) => u.includes('datagetter'))
    expect(new URL(coops ?? '').searchParams.get('begin_date')).toBe('20261001')
  })

  it('skips tides for a point with no station near it', async () => {
    route(() => json({}))
    const data = await loadForecastTimeline(INLAND)
    expect(data).toMatchObject({ tides: [], station: null, tideMessage: null })
    expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]).includes('datagetter'))).toBe(false)
  })

  it("keeps the wind when CO-OPS has no predictions, with CO-OPS's message", async () => {
    route(() => json(makeCoopsError('No Predictions data was found.')))
    const data = await loadForecastTimeline(COASTAL)
    expect(data.series).toHaveLength(3)
    expect(data.tideMessage).toBe('No Predictions data was found.')
  })

  it('keeps the wind when the tide request fails', async () => {
    route(() => json({}, 500))
    expect((await loadForecastTimeline(COASTAL)).tideMessage).toBe('The tide predictions could not be loaded.')
  })

  it('fails when the grid has no wind', async () => {
    route(() => json({}), makeGridpointData({ windSpeed: { values: [] } }))
    await expect(loadForecastTimeline(INLAND)).rejects.toThrow('no wind data')
  })

  it('fails when the point lookup fails', async () => {
    vi.mocked(fetch).mockResolvedValue(json({}, 503))
    await expect(loadForecastTimeline(INLAND)).rejects.toThrow()
  })
})
