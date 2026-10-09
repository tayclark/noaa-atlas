import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import graphJson from '../../data/graph.json'
import { clearNceiCache } from '../../data/nceiClient'
import { makeDailySummaries, makeGoesListingHtml } from '../../data/nceiFixtures'
import { parseDailySummaries, parseDirectoryListing, parseGoesListing } from '../../data/nceiSchema'
import { dailySummariesTable, dailyWindow, goesListingTable, latestGoesListing, NCEI_TRY_IT_STATION, NCEI_TRY_ITS } from './nceiTryIt'

const text = (body: string, status = 200) => new Response(body, { status })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const requestedUrls = () => vi.mocked(fetch).mock.calls.map(([url]) => String(url))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearNceiCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('dailyWindow', () => {
  it('spans the fourteen UTC days ending yesterday', () => {
    expect(dailyWindow(new Date('2026-10-09T23:30:00Z'))).toEqual({ start: '2026-09-25', end: '2026-10-08' })
  })

  it('crosses a year boundary', () => {
    expect(dailyWindow(new Date('2027-01-03T00:10:00Z'))).toEqual({ start: '2026-12-20', end: '2027-01-02' })
  })
})

describe('dailySummariesTable', () => {
  it('lists the days newest first in metric, named after the station', () => {
    const table = dailySummariesTable(parseDailySummaries(makeDailySummaries()))
    expect(table.caption).toBe('GHCN-Daily at ATLANTA HARTSFIELD JACKSON INTERNATIONAL AIRPORT, GA US, latest 3 days')
    expect(table.rows).toEqual([
      ['2026-10-04', '25.6 °C', '21.1 °C', '9.1 mm'],
      ['2026-10-03', '30.0 °C', '21.1 °C', '5.1 mm'],
      ['2026-10-02', '28.9 °C', '21.1 °C', '0.0 mm'],
    ])
  })

  it('shows a missing reading as n/a and falls back to the station id', () => {
    const table = dailySummariesTable([{ date: '2026-10-01', station: 'X', name: null, tmax: null, tmin: 3, prcp: null }])
    expect(table.caption).toBe(`GHCN-Daily at ${NCEI_TRY_IT_STATION}, latest 1 days`)
    expect(table.rows).toEqual([['2026-10-01', 'n/a', '3.0 °C', 'n/a']])
  })

  it('says so when the window has no days', () => {
    expect(dailySummariesTable([])).toMatchObject({ caption: `GHCN-Daily at ${NCEI_TRY_IT_STATION}: no days reported in the last 14`, rows: [] })
  })
})

describe('goesListingTable', () => {
  it('lists the latest files first with the month in the caption', () => {
    const files = parseGoesListing(parseDirectoryListing(makeGoesListingHtml()))
    const table = goesListingTable(files, 2026, 10)
    expect(table.caption).toBe('GOES-19 XRS one-minute flux files for 2026-10, latest 3 of 3')
    expect(table.rows[0]).toEqual(['2026-10-03', 'sci_xrsf-l2-avg1m_g19_d20261003_v2-2-1.nc', '2026-10-09 04:33', '286K'])
  })

  it('shows at most ten files', () => {
    const files = Array.from({ length: 12 }, (_, i) => ({ name: `f${i}`, dataDate: `2026-09-${String(i + 1).padStart(2, '0')}`, modified: '', size: '' }))
    const table = goesListingTable(files, 2026, 9)
    expect(table.caption).toBe('GOES-19 XRS one-minute flux files for 2026-09, latest 10 of 12')
    expect(table.rows[0][0]).toBe('2026-09-12')
  })
})

describe('latestGoesListing', () => {
  it("lists this month's files", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(text(makeGoesListingHtml()))
    const table = await latestGoesListing(new Date('2026-10-09T12:00:00Z'))
    expect(table.rows).toHaveLength(3)
    expect(requestedUrls()).toEqual([expect.stringMatching(/\/2026\/10\/$/)])
  })

  it('falls back to last month, across the year, when this month is a 404', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(text('Not Found', 404)).mockResolvedValueOnce(text(makeGoesListingHtml()))
    const table = await latestGoesListing(new Date('2027-01-01T01:00:00Z'))
    expect(table.caption).toContain('for 2026-12')
    expect(requestedUrls()[1]).toMatch(/\/2026\/12\/$/)
  })

  it('falls back to last month when this month has no files yet', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(text(makeGoesListingHtml({ empty: true }))).mockResolvedValueOnce(text(makeGoesListingHtml()))
    const table = await latestGoesListing(new Date('2026-11-01T02:00:00Z'))
    expect(table.caption).toContain('for 2026-10')
  })

  it('rethrows any other failure without trying last month', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(text('Service Unavailable', 503))
    await expect(latestGoesListing(new Date('2026-10-09T12:00:00Z'))).rejects.toThrow('NCEI request failed (503).')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('NCEI_TRY_ITS', () => {
  it('runs the ADS node as the try-it station over the last two weeks', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-09T23:30:00Z'), toFake: ['Date'] })
    vi.mocked(fetch).mockResolvedValueOnce(json(makeDailySummaries()))
    const tables = await NCEI_TRY_ITS['ncei-access-data-service']?.()
    const params = new URL(requestedUrls()[0]).searchParams
    expect([params.get('stations'), params.get('startDate'), params.get('endDate')]).toEqual([NCEI_TRY_IT_STATION, '2026-09-25', '2026-10-08'])
    expect(tables?.[0].rows).toHaveLength(3)
  })

  it('runs the GOES-R node as one listing table', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(text(makeGoesListingHtml()))
    const tables = await NCEI_TRY_ITS['ncei-goes-r-space-weather']?.()
    expect(tables).toHaveLength(1)
  })

  it('keeps both nodes live, with sample urls the try-its match', () => {
    const ads = graphJson.nodes.find((n) => n.id === 'ncei-access-data-service')
    const goes = graphJson.nodes.find((n) => n.id === 'ncei-goes-r-space-weather')
    expect([ads?.liveLayer, goes?.liveLayer]).toEqual([true, true])
    expect(ads?.sample?.url).toContain(`stations=${NCEI_TRY_IT_STATION}`)
    expect(ads?.sample?.url).toContain('units=metric')
    expect(goes?.sample?.url).toContain('/goes19/l2/data/xrsf-l2-avg1m_science/')
  })
})
