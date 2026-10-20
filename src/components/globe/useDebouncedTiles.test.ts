// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TILE_DEBOUNCE_MS, useDebouncedTiles } from './useDebouncedTiles'

function fakeMap() {
  const setTiles = vi.fn()
  return { setTiles, ref: { current: { getSource: vi.fn(() => ({ setTiles })) } as never } }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function render(ref: ReturnType<typeof fakeMap>['ref'], url: string | null, mapLoaded = true) {
  return renderHook((p: { url: string | null; mapLoaded: boolean }) => useDebouncedTiles(ref, p.mapLoaded, 'src', 'u0', p.url), {
    initialProps: { url, mapLoaded },
  })
}

describe('useDebouncedTiles', () => {
  it('leaves the source alone for the initial URL, an unwanted layer or an unloaded map', () => {
    const { setTiles, ref } = fakeMap()
    const { rerender } = render(ref, 'u0')
    rerender({ url: null, mapLoaded: true })
    rerender({ url: 'u1', mapLoaded: false })
    vi.advanceTimersByTime(TILE_DEBOUNCE_MS * 2)
    expect(setTiles).not.toHaveBeenCalled()
  })

  it('applies only the last URL of a quick run of changes', () => {
    const { setTiles, ref } = fakeMap()
    const { rerender } = render(ref, 'u0')
    rerender({ url: 'u1', mapLoaded: true })
    vi.advanceTimersByTime(TILE_DEBOUNCE_MS - 1)
    rerender({ url: 'u2', mapLoaded: true })
    vi.advanceTimersByTime(TILE_DEBOUNCE_MS)
    expect(setTiles).toHaveBeenCalledTimes(1)
    expect(setTiles).toHaveBeenCalledWith(['u2'])
  })

  it('does not reapply a URL the source already has', () => {
    const { setTiles, ref } = fakeMap()
    const { rerender } = render(ref, 'u1')
    vi.advanceTimersByTime(TILE_DEBOUNCE_MS)
    rerender({ url: null, mapLoaded: true })
    rerender({ url: 'u1', mapLoaded: true })
    vi.advanceTimersByTime(TILE_DEBOUNCE_MS)
    expect(setTiles).toHaveBeenCalledTimes(1)
  })
})
