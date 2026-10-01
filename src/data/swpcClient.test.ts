import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'
import {
  clearSwpcCache,
  getGoesXrays,
  getNoaaScales,
  getOvationAurora,
  getPlanetaryKp,
  getSolarWind,
  getSpaceWeatherAlerts,
  SwpcHttpError,
  SwpcParseError,
} from './swpcClient'
import { makeAlerts, makeKp1m, makeOvation, makeScales, makeSolarWindRows, makeXrayRows } from './swpcFixtures'

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

describe('space weather try-it feeds (#240)', () => {
  it('fetches and validates noaa-scales.json', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeScales()))
    const scales = await getNoaaScales()
    expect(fetch).toHaveBeenCalledWith('https://services.swpc.noaa.gov/products/noaa-scales.json', expect.any(Object))
    expect(scales['2'].G.Text).toBe('minor')
  })

  it('fetches alerts.json', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeAlerts()))
    expect(await getSpaceWeatherAlerts()).toHaveLength(2)
    expect(fetch).toHaveBeenCalledWith('https://services.swpc.noaa.gov/products/alerts.json', expect.any(Object))
  })

  it('keeps only the active spacecraft rows of the solar wind file, newest first', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeSolarWindRows(3).reverse()))
    const rows = await getSolarWind()
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.source === 'SOLAR1')).toBe(true)
    expect(rows[0].time_tag > rows[2].time_tag).toBe(true)
  })

  it('drops active rows that have no speed', async () => {
    const rows = makeSolarWindRows(1)
    rows[0].proton_speed = null as never
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(rows))
    expect(await getSolarWind()).toEqual([])
  })

  it('fetches the GOES X-ray file', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeXrayRows()))
    expect(await getGoesXrays()).toHaveLength(6)
    expect(fetch).toHaveBeenCalledWith('https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json', expect.any(Object))
  })

  it('wraps a malformed scales response as a parse error and logs it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ '0': { R: 1 } }))
    await expect(getNoaaScales()).rejects.toBeInstanceOf(SwpcParseError)
    expect(getRequestLogSnapshot()[0].status).toBe('parse-error')
  })
})
