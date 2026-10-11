// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRequestLog, getRequestLogSnapshot } from '../../data/requestLog'
import { useWmsFrames } from './useWmsFrames'

const URL = 'https://nowcoast.noaa.gov/geoserver/weather_radar/wms?service=WMS&version=1.3.0&request=GetCapabilities'
const REFRESH_MS = 60_000
const parse = (xml: string) => xml.split(',')

/** A fetch whose responses the test sends, each tied to the signal it was called with. */
function deferredFetch() {
  const calls: { signal: AbortSignal | undefined; respond: (body: string) => void }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((_: string, init?: RequestInit) => {
      const signal = init?.signal ?? undefined
      return new Promise<Response>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        calls.push({ signal, respond: (body) => resolve(new Response(body)) })
      })
    }),
  )
  return calls
}

const flush = () => act(async () => {})

beforeEach(() => {
  vi.useFakeTimers()
  clearRequestLog()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useWmsFrames', () => {
  it('reads nothing until shown, then the frame list, logged for the Inspector', async () => {
    const calls = deferredFetch()
    const { result, rerender } = renderHook(({ shown }) => useWmsFrames(URL, parse, shown, true, REFRESH_MS), { initialProps: { shown: false } })
    expect(calls).toHaveLength(0)
    rerender({ shown: true })
    calls[0]!.respond('a,b')
    await flush()
    expect(result.current).toEqual(['a', 'b'])
    expect(getRequestLogSnapshot()).toHaveLength(1)
  })

  it('aborts a poll in flight when the layer is hidden, so it writes no stale frames (#354)', async () => {
    const calls = deferredFetch()
    const { result, rerender } = renderHook(({ shown }) => useWmsFrames(URL, parse, shown, true, REFRESH_MS), { initialProps: { shown: true } })
    calls[0]!.respond('a')
    await flush()
    act(() => vi.advanceTimersByTime(REFRESH_MS))
    expect(calls).toHaveLength(2)
    expect(calls[1]!.signal).toBeDefined()

    rerender({ shown: false })
    expect(calls[1]!.signal!.aborted).toBe(true)
    calls[1]!.respond('stale')
    await flush()
    expect(result.current).toEqual([])
  })

  it('does not poll while the globe is not looked at, and aborts a poll when it stops being looked at', async () => {
    const calls = deferredFetch()
    const { rerender } = renderHook(({ active }) => useWmsFrames(URL, parse, true, active, REFRESH_MS), { initialProps: { active: true } })
    act(() => vi.advanceTimersByTime(REFRESH_MS))
    expect(calls).toHaveLength(2)
    rerender({ active: false })
    expect(calls[1]!.signal!.aborted).toBe(true)
    act(() => vi.advanceTimersByTime(REFRESH_MS * 3))
    expect(calls).toHaveLength(2)
  })

  it('keeps the frames it has when a read fails', async () => {
    const calls = deferredFetch()
    const { result } = renderHook(() => useWmsFrames(URL, parse, true, true, REFRESH_MS))
    calls[0]!.respond('a')
    await flush()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }))
    act(() => vi.advanceTimersByTime(REFRESH_MS))
    await flush()
    expect(result.current).toEqual(['a'])
  })

  it('aborts every read on unmount', async () => {
    const calls = deferredFetch()
    const { unmount } = renderHook(() => useWmsFrames(URL, parse, true, true, REFRESH_MS))
    act(() => vi.advanceTimersByTime(REFRESH_MS))
    unmount()
    expect(calls.map((call) => call.signal!.aborted)).toEqual([true, true])
  })
})
