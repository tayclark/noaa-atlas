import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'
import { getNowcoastCapabilities, NowcoastHttpError } from './nowcoastClient'

const URL = 'https://nowcoast.noaa.gov/geoserver/weather_radar/wms?service=WMS&version=1.3.0&request=GetCapabilities'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getNowcoastCapabilities', () => {
  it('fetches the same URL, returns the XML and logs the request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<WMS_Capabilities/>'))
    expect(await getNowcoastCapabilities(URL)).toBe('<WMS_Capabilities/>')
    expect(fetch).toHaveBeenCalledWith(URL, expect.any(Object))
    const [entry] = getRequestLogSnapshot()
    expect(entry).toMatchObject({ url: URL, status: 'success', httpStatus: 200 })
  })

  it('reads again every time rather than caching', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response('<x/>')))
    await getNowcoastCapabilities(URL)
    await getNowcoastCapabilities(URL)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws an http error for a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(getNowcoastCapabilities(URL)).rejects.toBeInstanceOf(NowcoastHttpError)
  })

  it('passes the signal on, and an abort is not logged', async () => {
    const controller = new AbortController()
    vi.mocked(fetch).mockImplementation((_, init) => {
      expect(init?.signal).toBe(controller.signal)
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    })
    controller.abort()
    await expect(getNowcoastCapabilities(URL, { signal: controller.signal })).rejects.toThrow('Aborted')
    expect(getRequestLogSnapshot()).toHaveLength(0)
  })

  it('refuses a URL on another host', async () => {
    await expect(getNowcoastCapabilities('https://example.com/wms')).rejects.toThrow('Not a nowCOAST URL')
    expect(fetch).not.toHaveBeenCalled()
  })
})
