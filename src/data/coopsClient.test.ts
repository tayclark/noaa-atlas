import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCoopsCache, CoopsHttpError, CoopsParseError, getHiloPredictions, getWaterLevel } from './coopsClient'
import { makeCoopsError, makePredictions, makeWaterLevel } from './coopsFixtures'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearCoopsCache()
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getWaterLevel', () => {
  it('requests the latest reading in metric MLLW and returns the last data row', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeWaterLevel()))
    const result = await getWaterLevel('8729108')
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('https://api.tidesandcurrents.noaa.gov/api/prod/datagetter')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      product: 'water_level',
      station: '8729108',
      date: 'latest',
      datum: 'MLLW',
      units: 'metric',
      time_zone: 'gmt',
      format: 'json',
      application: 'noaa-atlas',
    })
    expect(result).toEqual({ ok: true, value: { time: '2026-09-30 13:48', metres: 0.403 } })
  })

  it('treats an empty value as a missing reading', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeWaterLevel({ v: '' })))
    expect(await getWaterLevel('8729108')).toEqual({ ok: true, value: { time: '2026-09-30 13:48', metres: null } })
  })

  it("returns CO-OPS's own message for an HTTP 200 error body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeCoopsError()))
    expect(await getWaterLevel('9999999')).toEqual({ ok: false, message: 'There is no MLLW for the station: 9999999' })
  })

  it('caches successful responses', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(makeWaterLevel())))
    await getWaterLevel('8729108')
    await getWaterLevel('8729108')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws an http error with the status for a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    const error = await getWaterLevel('8729108').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CoopsHttpError)
    expect((error as CoopsHttpError).status).toBe(503)
  })

  it('throws a parse error when the body does not match', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ unexpected: true }))
    await expect(getWaterLevel('8729108')).rejects.toBeInstanceOf(CoopsParseError)
  })

  it('logs each request for the Inspector', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeWaterLevel()))
    await getWaterLevel('8729108')
    const [entry] = getRequestLogSnapshot()
    expect(entry.status).toBe('success')
    expect(entry.url).toContain('product=water_level')
  })
})

describe('getHiloPredictions', () => {
  it("requests today's hi/lo predictions and labels each tide", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makePredictions()))
    const result = await getHiloPredictions('8729108')
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(url.searchParams.get('product')).toBe('predictions')
    expect(url.searchParams.get('interval')).toBe('hilo')
    expect(url.searchParams.get('date')).toBe('today')
    expect(result).toEqual({
      ok: true,
      value: [
        { time: '2026-09-30 04:34', metres: 0.598, kind: 'high' },
        { time: '2026-09-30 15:46', metres: 0.073, kind: 'low' },
      ],
    })
  })

  it('returns the error message when CO-OPS has no predictions for the station', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeCoopsError('No Predictions data was found.')))
    expect(await getHiloPredictions('1')).toEqual({ ok: false, message: 'No Predictions data was found.' })
  })
})
