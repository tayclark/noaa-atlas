import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import idx from './fixtures/gfs-1p00-f012.idx?raw'
import grib from './fixtures/gfs-ugrd10m-f012.grib2.b64?raw'
import { clearGfsCache, cycleAtOrBefore, cycleCandidates, forecastHourFor, getLatestCycle, getWindField, GfsHttpError } from './gfsClient'
import { getRequestLogSnapshot } from './requestLog'

const bytes = Uint8Array.from(atob(grib.trim()), (c) => c.charCodeAt(0))
const T = (iso: string) => Date.parse(iso)

describe('cycle and hour maths', () => {
  it('rounds down to a 6-hourly cycle', () => {
    expect(cycleAtOrBefore(T('2026-10-01T08:19:00Z'))).toBe(T('2026-10-01T06:00:00Z'))
  })

  it('offers the newest published cycle first, with two fallbacks', () => {
    expect(cycleCandidates(T('2026-10-01T08:19:00Z')).map((c) => new Date(c).toISOString())).toEqual([
      '2026-10-01T00:00:00.000Z',
      '2026-09-30T18:00:00.000Z',
      '2026-09-30T12:00:00.000Z',
    ])
  })

  it('snaps to the 3-hourly files and clamps to the file range', () => {
    const cycle = T('2026-10-01T00:00:00Z')
    expect(forecastHourFor(cycle, T('2026-10-01T13:20:00Z'))).toBe(12)
    expect(forecastHourFor(cycle, T('2026-09-30T20:00:00Z'))).toBe(0)
    expect(forecastHourFor(cycle, T('2026-12-01T00:00:00Z'))).toBe(120)
  })
})

describe('gfs client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    clearGfsCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  function serve(missing: (url: string) => boolean = () => false) {
    fetchMock.mockImplementation(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (missing(url)) return new Response('', { status: 404 })
      if (url.endsWith('.idx')) return new Response(idx)
      expect(init?.headers?.Range).toMatch(/^bytes=\d+-\d+$/)
      return new Response(bytes)
    })
  }

  it('falls back to the previous cycle when the newest is not published yet', async () => {
    serve((url) => url.includes('/gfs.20261001/00/'))
    const cycle = await getLatestCycle(T('2026-10-01T08:19:00Z'))
    expect(new Date(cycle).toISOString()).toBe('2026-09-30T18:00:00.000Z')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Remembered, so no further requests.
    await getLatestCycle(T('2026-10-01T08:20:00Z'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws the 404 when no candidate cycle exists, and other errors straight away', async () => {
    serve(() => true)
    await expect(getLatestCycle(T('2026-10-01T08:19:00Z'))).rejects.toBeInstanceOf(GfsHttpError)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    await expect(getLatestCycle(T('2026-10-01T08:19:00Z'))).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetches the idx then a Range per component, decodes both and caches the result', async () => {
    serve()
    const cycle = T('2026-10-01T00:00:00Z')
    const field = await getWindField(cycle, 12)
    expect([field.u.ni, field.v.nj]).toEqual([360, 181])
    const urls = fetchMock.mock.calls.map((c) => c[0] as string)
    expect(urls[0]).toBe('https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20261001/00/atmos/gfs.t00z.pgrb2.1p00.f012.idx')
    expect(fetchMock.mock.calls[1][1].headers.Range).toBe('bytes=35505644-35584766')
    expect(fetchMock.mock.calls[2][1].headers.Range).toBe('bytes=35584767-35664804')
    expect(await getWindField(cycle, 12)).toBe(field)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(getRequestLogSnapshot()[0]).toMatchObject({ status: 'success', httpStatus: 200 })
  })

  it('does not cache a failed load', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    const cycle = T('2026-10-01T00:00:00Z')
    await expect(getWindField(cycle, 3)).rejects.toBeInstanceOf(GfsHttpError)
    serve()
    await expect(getWindField(cycle, 3)).resolves.toBeDefined()
  })
})
