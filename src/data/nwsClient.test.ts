import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearNwsCache,
  getActiveAlerts,
  getGridpointForecast,
  getLatestObservation,
  getPoint,
  getStations,
  NwsHttpError,
  NwsParseError,
} from './nwsClient'
import {
  makeAlertCollection,
  makeGridpointForecast,
  makeObservation,
  makePoint,
  makeStationCollection,
} from './nwsFixtures'
import { clearRequestLog, getRequestLogSnapshot } from './requestLog'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  clearNwsCache()
  clearRequestLog()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getActiveAlerts', () => {
  it('fetches and parses the alerts collection', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeAlertCollection()))
    const alerts = await getActiveAlerts()
    expect(alerts.features).toHaveLength(1)
    expect(fetch).toHaveBeenCalledWith('https://api.weather.gov/alerts/active', expect.any(Object))
  })

  it('sends an Accept header and no fake User-Agent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeAlertCollection()))
    await getActiveAlerts()
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers.Accept).toBe('application/geo+json')
    expect(headers['User-Agent']).toBeUndefined()
  })

  it('caches successful responses within the TTL', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(makeAlertCollection())))
    await getActiveAlerts()
    await getActiveAlerts()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not cache error responses', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(makeAlertCollection()))
    await expect(getActiveAlerts()).rejects.toThrow(NwsHttpError)
    await getActiveAlerts()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refetches after the cache entry expires', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(jsonResponse(makeAlertCollection())))
    await getActiveAlerts()
    vi.advanceTimersByTime(61_000)
    await getActiveAlerts()
    expect(fetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it.each([
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [500, 'server-error'],
    [503, 'server-error'],
    [404, 'unknown'],
  ] as const)('classifies a %i response as kind %s', async (status, kind) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }))
    const error = await getActiveAlerts().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NwsHttpError)
    expect((error as NwsHttpError).kind).toBe(kind)
    expect((error as NwsHttpError).message).toBeTruthy()
  })

  it('wraps a malformed response as a parse error, not a raw Zod error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ not: 'an alert collection' }))
    const error = await getActiveAlerts().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NwsParseError)
  })
})

describe('getPoint', () => {
  it('requests the points endpoint with lat,lon', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makePoint()))
    const point = await getPoint(47.6, -122.3)
    expect(point.properties.relativeLocation.properties.city).toBe('Seattle')
    expect(fetch).toHaveBeenCalledWith('https://api.weather.gov/points/47.6,-122.3', expect.any(Object))
  })

  it.each([
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [500, 'server-error'],
    [503, 'server-error'],
    [404, 'unknown'],
  ] as const)('classifies a %i response as kind %s', async (status, kind) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }))
    const error = await getPoint(47.6, -122.3).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NwsHttpError)
    expect((error as NwsHttpError).kind).toBe(kind)
    expect((error as NwsHttpError).message).toBeTruthy()
  })
})

describe('getGridpointForecast', () => {
  it('requests the gridpoints forecast endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeGridpointForecast()))
    const forecast = await getGridpointForecast('SEW', 125, 68)
    expect(forecast.properties.periods).toHaveLength(1)
    expect(fetch).toHaveBeenCalledWith('https://api.weather.gov/gridpoints/SEW/125,68/forecast', expect.any(Object))
  })
})

describe('getStations', () => {
  it('requests the gridpoints stations endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeStationCollection()))
    const stations = await getStations('SEW', 125, 68)
    expect(stations.features).toHaveLength(1)
    expect(fetch).toHaveBeenCalledWith('https://api.weather.gov/gridpoints/SEW/125,68/stations', expect.any(Object))
  })
})

describe('getLatestObservation', () => {
  it('requests the station latest-observation endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeObservation()))
    const observation = await getLatestObservation('KSEA')
    expect(observation.properties.textDescription).toBe('Mostly Cloudy')
    expect(fetch).toHaveBeenCalledWith(
      'https://api.weather.gov/stations/KSEA/observations/latest',
      expect.any(Object),
    )
  })

  it.each([
    [403, 'forbidden'],
    [429, 'rate-limited'],
    [500, 'server-error'],
    [503, 'server-error'],
    [404, 'unknown'],
  ] as const)('classifies a %i response as kind %s', async (status, kind) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }))
    const error = await getLatestObservation('KSEA').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NwsHttpError)
    expect((error as NwsHttpError).kind).toBe(kind)
    expect((error as NwsHttpError).message).toBeTruthy()
  })

  it('wraps a malformed response as a parse error, not a raw Zod error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ not: 'an observation' }))
    const error = await getLatestObservation('KSEA').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NwsParseError)
  })
})

describe('request log', () => {
  it('logs a successful call with the response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(makeAlertCollection()))
    await getActiveAlerts()
    const [entry] = getRequestLogSnapshot()
    expect(entry.status).toBe('success')
    expect(entry.url).toBe('https://api.weather.gov/alerts/active')
    expect(entry.httpStatus).toBe(200)
    expect(entry.responseBody).toEqual(makeAlertCollection())
  })

  it('does not log cache hits', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(makeAlertCollection()))
    await getActiveAlerts()
    await getActiveAlerts()
    expect(getRequestLogSnapshot()).toHaveLength(1)
  })

  it('logs an http-error call without a response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 429 }))
    await getActiveAlerts().catch(() => undefined)
    const [entry] = getRequestLogSnapshot()
    expect(entry.status).toBe('http-error')
    expect(entry.httpStatus).toBe(429)
    expect(entry.responseBody).toBeUndefined()
  })

  it('logs a parse-error call with the raw response body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ not: 'an alert collection' }))
    await getActiveAlerts().catch(() => undefined)
    const [entry] = getRequestLogSnapshot()
    expect(entry.status).toBe('parse-error')
    expect(entry.responseBody).toEqual({ not: 'an alert collection' })
  })

  it('logs a network-error call with the failure message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    await getActiveAlerts().catch(() => undefined)
    const [entry] = getRequestLogSnapshot()
    expect(entry.status).toBe('network-error')
    expect(entry.errorMessage).toBe('offline')
  })
})
