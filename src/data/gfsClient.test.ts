import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import idx from './fixtures/gfs-1p00-f012.idx?raw'
import grib from './fixtures/gfs-ugrd10m-f012.grib2.b64?raw'
import waveIdx from './fixtures/gfswave-0p25-f024.idx?raw'
import waveGrib from './fixtures/gfswave-htsgw-f024.grib2.b64?raw'
import { clearGfsCache, cycleAtOrBefore, cycleCandidates, forecastHourFor, getLatestCycle, getReflectivityField, getWaveField, getWindField, GfsHttpError } from './gfsClient'
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

  it('fetches only the composite reflectivity message for the simulated radar, and caches it', async () => {
    serve()
    const cycle = T('2026-10-01T00:00:00Z')
    const field = await getReflectivityField(cycle, 12)
    expect([field.ni, field.nj]).toEqual([360, 181])
    expect(fetchMock.mock.calls[1][1].headers.Range).toBe('bytes=290933-364723')
    expect(await getReflectivityField(cycle, 12)).toBe(field)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports an index without reflectivity, and does not cache the failure', async () => {
    fetchMock.mockImplementation(async () => new Response('1:0:d=2026100100:PRMSL:mean sea level:12 hour fcst:\n'))
    const cycle = T('2026-10-01T00:00:00Z')
    await expect(getReflectivityField(cycle, 3)).rejects.toThrow('GFS index has no REFC')
    serve()
    await expect(getReflectivityField(cycle, 3)).resolves.toBeDefined()
  })

  it('does not cache a failed load', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    const cycle = T('2026-10-01T00:00:00Z')
    await expect(getWindField(cycle, 3)).rejects.toBeInstanceOf(GfsHttpError)
    serve()
    await expect(getWindField(cycle, 3)).resolves.toBeDefined()
  })

  describe('wave field', () => {
    const waveBytes = Uint8Array.from(atob(waveGrib.trim()), (c) => c.charCodeAt(0))
    const serveWaves = (missing: (url: string) => boolean = () => false) =>
      fetchMock.mockImplementation(async (url: string) => {
        if (missing(url)) return new Response('', { status: 404 })
        return new Response(url.endsWith('.idx') ? waveIdx : waveBytes)
      })

    it('probes the wave files for the cycle, separately from the atmos files', async () => {
      serveWaves((url) => url.includes('/gfs.20261001/00/'))
      const cycle = await getLatestCycle(T('2026-10-01T08:19:00Z'), 'wave')
      expect(new Date(cycle).toISOString()).toBe('2026-09-30T18:00:00.000Z')
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20261001/00/wave/gridded/gfswave.t00z.global.0p25.f000.grib2.idx',
      )
      serve()
      const atmos = await getLatestCycle(T('2026-10-01T08:19:00Z'))
      expect(new Date(atmos).toISOString()).toBe('2026-10-01T00:00:00.000Z')
    })

    it('reads HTSGW with one Range request, decodes it and caches the result', async () => {
      serveWaves()
      const cycle = T('2026-09-30T00:00:00Z')
      const field = await getWaveField(cycle, 24)
      expect([field.ni, field.nj]).toEqual([1440, 721])
      expect(fetchMock.mock.calls[0][0]).toMatch(/gfs\.20260930\/00\/wave\/gridded\/gfswave\.t00z\.global\.0p25\.f024\.grib2\.idx$/)
      expect(fetchMock.mock.calls[1][1].headers.Range).toBe('bytes=3085809-3520678')
      expect(await getWaveField(cycle, 24)).toBe(field)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not cache a failed wave load', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 503 }))
      const cycle = T('2026-09-30T00:00:00Z')
      await expect(getWaveField(cycle, 3)).rejects.toBeInstanceOf(GfsHttpError)
      serveWaves()
      await expect(getWaveField(cycle, 3)).resolves.toBeDefined()
    })
  })
})
