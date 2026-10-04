import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCoopsCache,
  CoopsHttpError,
  CoopsParseError,
  getHiloPredictions,
  getHourlyPredictions,
  getHtfAnnual,
  getSeaLevelTrend,
  getStationMetadata,
  getWaterLevel,
} from './coopsClient'
import {
  makeCoopsError,
  makeHourlyPredictions,
  makeHtfAnnual,
  makePredictions,
  makeSeaLevelTrend,
  makeStationMetadata,
  makeWaterLevel,
} from './coopsFixtures'
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

describe('getHourlyPredictions', () => {
  it('requests the hourly curve for the date range', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeHourlyPredictions()))
    const result = await getHourlyPredictions('8729108', '20261001', '20261008')
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(url.searchParams.get('interval')).toBe('h')
    expect(url.searchParams.get('begin_date')).toBe('20261001')
    expect(url.searchParams.get('end_date')).toBe('20261008')
    expect(result).toMatchObject({ ok: true, value: [{ time: '2026-10-01 00:00', metres: 0.392 }, {}, {}] })
  })

  it('returns the error message when CO-OPS has no predictions for the station', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeCoopsError('No Predictions data was found.')))
    expect(await getHourlyPredictions('1', '20261001', '20261002')).toEqual({
      ok: false,
      message: 'No Predictions data was found.',
    })
  })
})

describe('getStationMetadata (#241)', () => {
  it('requests the station with its details, datums and flood levels in metric', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeStationMetadata()))
    const station = await getStationMetadata('8729108')
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/8729108.json?expand=details,datums,floodlevels&units=metric',
    )
    expect(station).toMatchObject({ id: '8729108', name: 'Panama City', state: 'FL', floodlevels: { nos_minor: 1.944 } })
    expect(station.datums.datums[1]).toEqual({ name: 'MHHW', description: 'Mean Higher-High Water', value: 1.428 })
    expect(getRequestLogSnapshot()[0]).toMatchObject({ status: 'success', path: expect.stringContaining('/mdapi/') })
  })

  it('accepts a Great Lakes station with no tidal epoch or flood levels', async () => {
    const body = makeStationMetadata()
    body.stations[0].datums.epoch = null as never
    body.stations[0].floodlevels = { ...body.stations[0].floodlevels, nos_minor: null, nos_moderate: null, nos_major: null } as never
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body))
    expect((await getStationMetadata('9063020')).datums.epoch).toBeNull()
  })

  it('throws an http error for an unknown station (mdapi answers 404)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ errorMsg: 'No station was found for id 0000000', errorCode: 404 }, 404))
    const error = await getStationMetadata('0000000').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CoopsHttpError)
    expect((error as CoopsHttpError).status).toBe(404)
  })

  it('throws a parse error for an empty station list', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ count: 0, stations: [] }))
    await expect(getStationMetadata('8729108')).rejects.toBeInstanceOf(CoopsParseError)
  })
})

describe('getSeaLevelTrend (#241)', () => {
  it('requests the metric trend and returns the first entry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeSeaLevelTrend()))
    const result = await getSeaLevelTrend('8729108')
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://api.tidesandcurrents.noaa.gov/dpapi/prod/webapi/product/sealvltrends.json?station=8729108&units=metric',
    )
    expect(result).toMatchObject({ ok: true, value: { stationName: 'Panama City', trend: 3.08, trendError: 0.26, trendUnits: 'mm/yr' } })
  })

  it('reports a station without a trend (dpapi answers 200 with an empty list)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ count: 0, SeaLvlTrends: [] }))
    expect(await getSeaLevelTrend('0000000')).toEqual({ ok: false, message: 'CO-OPS has no sea level trend for this station.' })
  })
})

describe('getHtfAnnual (#241)', () => {
  it('requests the annual flood counts, keeping null years', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeHtfAnnual()))
    const years = await getHtfAnnual('8729108')
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.tidesandcurrents.noaa.gov/dpapi/prod/webapi/htf/htf_annual.json?station=8729108')
    expect(years[0]).toEqual({ year: 2012, minCount: null, modCount: null, majCount: null })
    expect(years.find((y) => y.year === 2024)).toEqual({ year: 2024, minCount: 6, modCount: 1, majCount: 0 })
  })
})
