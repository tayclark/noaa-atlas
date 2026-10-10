// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
})

function stub(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const list = {
    get matches() {
      return matches
    },
    addEventListener: vi.fn((_: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_: string, listener: () => void) => listeners.delete(listener)),
  }
  const matchMedia = vi.fn(() => list)
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })
  return {
    matchMedia,
    list,
    set(next: boolean) {
      matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

describe('useMediaQuery', () => {
  it('never matches where there is no matchMedia (jsdom)', () => {
    expect(renderHook(() => useMediaQuery('(orientation: landscape)')).result.current).toBe(false)
  })

  it('follows the query as it changes', () => {
    const media = stub(false)
    const { result } = renderHook(() => useMediaQuery('(orientation: landscape)'))
    expect(media.matchMedia).toHaveBeenCalledWith('(orientation: landscape)')
    expect(result.current).toBe(false)
    act(() => media.set(true))
    expect(result.current).toBe(true)
  })

  it('subscribes once, not again on every render (#352)', () => {
    const media = stub(false)
    const { rerender } = renderHook(() => useMediaQuery('(orientation: landscape)'))
    rerender()
    rerender()
    expect(media.list.addEventListener).toHaveBeenCalledTimes(1)
    expect(media.list.removeEventListener).not.toHaveBeenCalled()
  })

  it('subscribes afresh when the query changes', () => {
    const media = stub(false)
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), { initialProps: { query: '(orientation: landscape)' } })
    rerender({ query: '(orientation: portrait)' })
    expect(media.matchMedia).toHaveBeenCalledWith('(orientation: portrait)')
    expect(media.list.removeEventListener).toHaveBeenCalledTimes(1)
    expect(media.list.addEventListener).toHaveBeenCalledTimes(2)
  })
})
