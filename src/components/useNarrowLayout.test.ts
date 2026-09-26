// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NARROW_LAYOUT_QUERY, useNarrowLayout } from './useNarrowLayout'

afterEach(() => {
  // jsdom has no matchMedia of its own, so remove the stub again.
  delete (window as { matchMedia?: unknown }).matchMedia
})

function stubMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const query = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  const matchMedia = vi.fn(() => query)
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })
  return {
    matchMedia,
    set(next: boolean) {
      matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

describe('useNarrowLayout', () => {
  it('is false where there is no matchMedia (jsdom, so the app tests stay wide)', () => {
    expect(renderHook(() => useNarrowLayout()).result.current).toBe(false)
  })

  it('follows the phone-width media query as it changes', () => {
    const media = stubMatchMedia(true)
    const { result } = renderHook(() => useNarrowLayout())
    expect(media.matchMedia).toHaveBeenCalledWith(NARROW_LAYOUT_QUERY)
    expect(result.current).toBe(true)

    act(() => media.set(false))
    expect(result.current).toBe(false)
  })
})
