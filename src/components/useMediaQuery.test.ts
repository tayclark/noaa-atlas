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
})
