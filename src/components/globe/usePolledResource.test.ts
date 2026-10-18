// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePolledResource } from './usePolledResource'

const INTERVAL = 60_000
const RETRY = 5_000
const describeError = (err: unknown) => `failed: ${String(err)}`

/** A fetcher whose calls wait until the test settles them, oldest first. */
function deferredFetcher() {
  const calls: { resolve: (value: string) => void; reject: (err: unknown) => void }[] = []
  const fetcher = vi.fn(() => new Promise<string>((resolve, reject) => calls.push({ resolve, reject })))
  const settle = async (outcome: string | Error) => {
    const call = calls.shift()!
    await act(async () => (outcome instanceof Error ? call.reject(outcome) : call.resolve(outcome)))
  }
  return { fetcher, settle, calls }
}

function renderPolled(fetcher: () => Promise<string>, props: { enabled: boolean; active: boolean }, retryMs?: number) {
  return renderHook(({ enabled, active }) => usePolledResource(enabled, active, fetcher, INTERVAL, { describeError, retryMs }), {
    initialProps: props,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('usePolledResource', () => {
  it('fetches nothing until enabled, then loads once', async () => {
    const { fetcher, settle } = deferredFetcher()
    const { result, rerender } = renderPolled(fetcher, { enabled: false, active: true })
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current).toEqual({ status: 'loading' })
    rerender({ enabled: true, active: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
    await settle('a')
    expect(result.current).toEqual({ status: 'ok', data: 'a' })
  })

  it('refreshes while active, keeping the last good data when a refresh fails', async () => {
    const { fetcher, settle } = deferredFetcher()
    const { result } = renderPolled(fetcher, { enabled: true, active: true })
    await settle('a')
    act(() => vi.advanceTimersByTime(INTERVAL))
    expect(fetcher).toHaveBeenCalledTimes(2)
    await settle(new Error('down'))
    expect(result.current).toEqual({ status: 'ok', data: 'a' })
    act(() => vi.advanceTimersByTime(INTERVAL))
    await settle('b')
    expect(result.current).toEqual({ status: 'ok', data: 'b' })
  })

  it('reports a failed first load as an error, and recovers on a later success', async () => {
    const { fetcher, settle } = deferredFetcher()
    const { result } = renderPolled(fetcher, { enabled: true, active: true })
    await settle(new Error('down'))
    expect(result.current).toEqual({ status: 'error', message: 'failed: Error: down' })
    act(() => vi.advanceTimersByTime(INTERVAL))
    await settle('a')
    expect(result.current).toEqual({ status: 'ok', data: 'a' })
  })

  it('stops polling while inactive, and refreshes at once on return only when stale', async () => {
    const { fetcher, settle } = deferredFetcher()
    const { rerender } = renderPolled(fetcher, { enabled: true, active: true })
    await settle('a')
    rerender({ enabled: true, active: false })
    act(() => vi.advanceTimersByTime(INTERVAL * 3))
    expect(fetcher).toHaveBeenCalledTimes(1)
    rerender({ enabled: true, active: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
    await settle('b')
    rerender({ enabled: true, active: false })
    rerender({ enabled: true, active: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('forgets its data when disabled and drops a response that lands after that', async () => {
    const { fetcher, settle } = deferredFetcher()
    const { result, rerender } = renderPolled(fetcher, { enabled: true, active: true })
    await settle('a')
    act(() => vi.advanceTimersByTime(INTERVAL))
    rerender({ enabled: false, active: true })
    expect(result.current).toEqual({ status: 'loading' })
    await settle('late')
    expect(result.current).toEqual({ status: 'loading' })
    act(() => vi.advanceTimersByTime(INTERVAL))
    expect(fetcher).toHaveBeenCalledTimes(2)
    // A failure on the next enable is an error again: the earlier success no longer counts.
    rerender({ enabled: true, active: true })
    await settle(new Error('down'))
    expect(result.current.status).toBe('error')
  })

  it('retries a failed first load sooner when asked, and only until it succeeds', async () => {
    const { fetcher, settle } = deferredFetcher()
    renderPolled(fetcher, { enabled: true, active: true }, RETRY)
    await settle(new Error('down'))
    act(() => vi.advanceTimersByTime(RETRY))
    expect(fetcher).toHaveBeenCalledTimes(2)
    await settle('a')
    act(() => vi.advanceTimersByTime(RETRY))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not retry sooner without a retry interval', async () => {
    const { fetcher, settle } = deferredFetcher()
    renderPolled(fetcher, { enabled: true, active: true })
    await settle(new Error('down'))
    act(() => vi.advanceTimersByTime(RETRY))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('aborts the request when disabled, and the older request when a refresh starts', async () => {
    const signals: AbortSignal[] = []
    const fetcher = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return new Promise<string>(() => {})
    })
    const { rerender } = renderHook(
      ({ enabled }) => usePolledResource(enabled, true, fetcher, INTERVAL, { describeError }),
      { initialProps: { enabled: true } },
    )
    act(() => vi.advanceTimersByTime(INTERVAL))
    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    rerender({ enabled: false })
    expect(signals[1].aborted).toBe(true)
  })
})
