import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArcgisHttpError, ArcgisParseError, clearArcgisCache, getArcgisLegend } from './arcgisClient'
import { makeArcgisLegend } from './arcgisFixtures'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'

const SERVICE = 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/rfc_qpe/MapServer'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearArcgisCache()
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getArcgisLegend', () => {
  it('fetches the service legend and logs the request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeArcgisLegend()))
    const legend = await getArcgisLegend(SERVICE)
    expect(fetch).toHaveBeenCalledWith(`${SERVICE}/legend?f=json`, expect.any(Object))
    expect(legend.layers.map((l) => l.layerId)).toEqual([2, 28])
    expect(getRequestLogSnapshot()).toHaveLength(1)
  })

  it('caches successful responses', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(makeArcgisLegend())))
    await getArcgisLegend(SERVICE)
    await getArcgisLegend(SERVICE)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws an http error with the status for a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    const error = await getArcgisLegend(SERVICE).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ArcgisHttpError)
    expect((error as ArcgisHttpError).status).toBe(503)
  })

  it('wraps a malformed response as a parse error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ layers: [{ layerId: 'x' }] }))
    await expect(getArcgisLegend(SERVICE)).rejects.toBeInstanceOf(ArcgisParseError)
  })
})
