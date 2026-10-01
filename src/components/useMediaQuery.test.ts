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
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  const matchMedia = vi.fn(() => list)
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })
  return {
    matchMedia,
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
})
