import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNceiCache, getDailySummaries, getGoesXrsListing, NceiHttpError, NceiParseError } from './nceiClient'
import { makeAccessDataError, makeDailySummaries, makeGoesListingHtml } from './nceiFixtures'
import { parseDirectoryListing } from './nceiSchema'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearNceiCache()
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getDailySummaries (#242)', () => {
  it('requests GHCN-Daily max, min and precipitation in metric with the station name', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeDailySummaries()))
    const rows = await getDailySummaries('USW00013874', '2026-09-26', '2026-10-09')
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe('https://www.ncei.noaa.gov/access/services/data/v1')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      dataset: 'daily-summaries',
      stations: 'USW00013874',
      startDate: '2026-09-26',
      endDate: '2026-10-09',
      dataTypes: 'TMAX,TMIN,PRCP',
      units: 'metric',
      includeStationName: 'true',
      format: 'json',
    })
    expect(rows[2]).toEqual({
      date: '2026-10-04',
      station: 'USW00013874',
      name: 'ATLANTA HARTSFIELD JACKSON INTERNATIONAL AIRPORT, GA US',
      tmax: 25.6,
      tmin: 21.1,
      prcp: 9.1,
    })
  })

  it('treats a missing or blank element as no value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ DATE: '2026-10-04', STATION: 'USW00013874', TMAX: '  ', TMIN: '21.1' }]))
    const [row] = await getDailySummaries('USW00013874', '2026-10-04', '2026-10-04')
    expect(row).toMatchObject({ name: null, tmax: null, tmin: 21.1, prcp: null })
  })

  it('throws an http error for a bad request (ADS answers 400)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeAccessDataError(), 400))
    await expect(getDailySummaries('X', '2026-10-01', '2026-10-02')).rejects.toThrow(NceiHttpError)
    expect(getRequestLogSnapshot()[0]).toMatchObject({ status: 'http-error', httpStatus: 400 })
  })

  it('throws a parse error for an unexpected body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ rows: [] }))
    await expect(getDailySummaries('USW00013874', '2026-10-01', '2026-10-02')).rejects.toThrow(NceiParseError)
  })
})

describe('getGoesXrsListing (#242)', () => {
  it('lists the month folder and dates each file from its name', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(makeGoesListingHtml()))
    const files = await getGoesXrsListing(2026, 10)
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://data.ngdc.noaa.gov/platforms/solar-space-observing-satellites/goes/goes19/l2/data/xrsf-l2-avg1m_science/2026/10/',
    )
    expect(files).toHaveLength(3)
    expect(files[0]).toEqual({
      name: 'sci_xrsf-l2-avg1m_g19_d20261001_v2-2-1.nc',
      dataDate: '2026-10-01',
      modified: '2026-10-08 04:31',
      size: '287K',
    })
  })

  it('logs the decoded rows, not the HTML, for the Inspector', async () => {
    const html = makeGoesListingHtml()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(html))
    await getGoesXrsListing(2026, 10)
    const [entry] = getRequestLogSnapshot()
    expect(entry.status).toBe('success')
    expect(entry.responseBody).toEqual(parseDirectoryListing(html))
    expect(entry.responseSize).toBe(html.length)
  })

  it('returns no files for an empty folder', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(makeGoesListingHtml({ empty: true })))
    expect(await getGoesXrsListing(2026, 10)).toEqual([])
  })

  it('throws a parse error for a page that is not a directory listing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html><title>Service unavailable</title></html>'))
    await expect(getGoesXrsListing(2026, 10)).rejects.toThrow(NceiParseError)
  })

  it('throws an http error for a month that has not started (404)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
    await expect(getGoesXrsListing(2026, 11)).rejects.toMatchObject({ name: 'NceiHttpError', status: 404 })
  })
})
