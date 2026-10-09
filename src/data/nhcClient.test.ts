import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNhcCache, getActiveStorms, NhcHttpError, NhcParseError } from './nhcClient'
import { emptyNhcStormData, makeNhcStormData } from './nhcFixtures'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'

const BASE = 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

/** Answers each layer query with its part of the given data. */
function serve(data = makeNhcStormData()) {
  vi.mocked(fetch).mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/10/query')) return Promise.resolve(jsonResponse(data.past))
    if (url.includes('/5/query')) return Promise.resolve(jsonResponse(data.forecast))
    return Promise.resolve(jsonResponse(data.cones))
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearNhcCache()
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getActiveStorms', () => {
  it('queries the past points, forecast points and cone layers as GeoJSON and logs each request', async () => {
    serve()
    const storms = await getActiveStorms()
    for (const layer of [10, 5, 7]) {
      expect(fetch).toHaveBeenCalledWith(`${BASE}/${layer}/query?where=1%3D1&outFields=*&f=geojson`, expect.any(Object))
    }
    expect(storms.past.features).toHaveLength(9)
    expect(storms.forecast.features[3]?.properties.stormname).toBe('Hurricane Isaias')
    expect(storms.cones.features[0]?.properties.binnumber).toBe('AT4')
    expect(getRequestLogSnapshot()).toHaveLength(3)
  })

  it('caches successful responses', async () => {
    serve()
    await getActiveStorms()
    await getActiveStorms()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('accepts a quiet season with no storms', async () => {
    serve(emptyNhcStormData())
    expect(await getActiveStorms()).toEqual(emptyNhcStormData())
  })

  it('throws an http error with the status for a non-2xx response', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(null, { status: 503 })))
    const error = await getActiveStorms().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NhcHttpError)
    expect((error as NhcHttpError).status).toBe(503)
  })

  it('wraps a malformed response as a parse error', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse({ type: 'FeatureCollection', features: [{ type: 'Feature' }] })))
    await expect(getActiveStorms()).rejects.toBeInstanceOf(NhcParseError)
  })
})
