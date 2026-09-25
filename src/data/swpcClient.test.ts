import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'
import { clearSwpcCache, getOvationAurora, getPlanetaryKp, SwpcHttpError, SwpcParseError } from './swpcClient'
import { makeKp1m, makeOvation } from './swpcFixtures'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearSwpcCache()
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getOvationAurora', () => {
  it('fetches the latest OVATION file and renames its time fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeOvation()))
    const ovation = await getOvationAurora()
    expect(fetch).toHaveBeenCalledWith('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', expect.any(Object))
    expect(ovation.forecastTime).toBe('2026-09-25T01:22:00Z')
    expect(ovation.observationTime).toBe('2026-09-25T00:20:00Z')
    expect(ovation.coordinates).toHaveLength(3)
  })

  it('caches successful responses', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(makeOvation())))
    await getOvationAurora()
    await getOvationAurora()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws an http error with the status for a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    const error = await getOvationAurora().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SwpcHttpError)
    expect((error as SwpcHttpError).status).toBe(503)
  })

  it('wraps a malformed response as a parse error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ coordinates: [[0, 0]] }))
    await expect(getOvationAurora()).rejects.toBeInstanceOf(SwpcParseError)
  })
})

describe('getPlanetaryKp', () => {
  it('fetches the one-minute Kp file', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeKp1m()))
    const rows = await getPlanetaryKp()
    expect(fetch).toHaveBeenCalledWith('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', expect.any(Object))
    expect(rows.at(-1)?.estimated_kp).toBe(3.33)
  })

  it('rejects an empty series', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]))
    await expect(getPlanetaryKp()).rejects.toBeInstanceOf(SwpcParseError)
  })

  it('logs the call for the Inspector with the SWPC url', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeKp1m()))
    await getPlanetaryKp()
    const [entry] = getRequestLogSnapshot()
    expect(entry.url).toBe('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')
    expect(entry.path).toBe('/json/planetary_k_index_1m.json')
    expect(entry.status).toBe('success')
    expect(entry.requestHeaders).toEqual({})
  })
})
