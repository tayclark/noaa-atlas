// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockMatchMedia, unmockMatchMedia } from '../test/matchMedia'
import { useMediaQuery } from './useMediaQuery'

afterEach(unmockMatchMedia)

describe('useMediaQuery', () => {
  it('never matches where there is no matchMedia (jsdom)', () => {
    expect(renderHook(() => useMediaQuery('(orientation: landscape)')).result.current).toBe(false)
  })

  it('follows the query as it changes', () => {
    const media = mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(orientation: landscape)'))
    expect(media.matchMedia).toHaveBeenCalledWith('(orientation: landscape)')
    expect(result.current).toBe(false)
    act(() => media.set(true))
    expect(result.current).toBe(true)
  })

  it('subscribes once, not again on every render (#352)', () => {
    const media = mockMatchMedia(false)
    const { rerender } = renderHook(() => useMediaQuery('(orientation: landscape)'))
    rerender()
    rerender()
    expect(media.list.addEventListener).toHaveBeenCalledTimes(1)
    expect(media.list.removeEventListener).not.toHaveBeenCalled()
  })

  it('subscribes afresh when the query changes', () => {
    const media = mockMatchMedia(false)
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), { initialProps: { query: '(orientation: landscape)' } })
    rerender({ query: '(orientation: portrait)' })
    expect(media.matchMedia).toHaveBeenCalledWith('(orientation: portrait)')
    expect(media.list.removeEventListener).toHaveBeenCalledTimes(1)
    expect(media.list.addEventListener).toHaveBeenCalledTimes(2)
  })
})
