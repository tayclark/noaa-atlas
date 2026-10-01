import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'
import { clearSpcCache, getDay1CategoricalOutlook, SpcHttpError, SpcParseError } from './spcClient'
import { makeSpcOutlook } from './spcFixtures'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearSpcCache()
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getDay1CategoricalOutlook', () => {
  it('fetches the Day 1 categorical file and logs the request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeSpcOutlook()))
    const outlook = await getDay1CategoricalOutlook()
    expect(fetch).toHaveBeenCalledWith(
      'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson',
      expect.any(Object),
    )
    expect(outlook.features.map((f) => f.properties.LABEL)).toEqual(['TSTM', 'MRGL'])
    expect(getRequestLogSnapshot()).toHaveLength(1)
  })

  it('caches successful responses', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(makeSpcOutlook())))
    await getDay1CategoricalOutlook()
    await getDay1CategoricalOutlook()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('accepts a quiet day with no features', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ type: 'FeatureCollection', features: [] }))
    expect((await getDay1CategoricalOutlook()).features).toEqual([])
  })

  it('throws an http error with the status for a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    const error = await getDay1CategoricalOutlook().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SpcHttpError)
    expect((error as SpcHttpError).status).toBe(503)
  })

  it('wraps a malformed response as a parse error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ type: 'FeatureCollection', features: [{ type: 'Feature' }] }))
    await expect(getDay1CategoricalOutlook()).rejects.toBeInstanceOf(SpcParseError)
  })
})
