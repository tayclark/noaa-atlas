// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { mockNarrowLayout, unmockNarrowLayout } from './narrowLayoutTestUtils'
import { NARROW_LAYOUT_QUERY, useNarrowLayout } from './useNarrowLayout'

afterEach(unmockNarrowLayout)

describe('useNarrowLayout', () => {
  it('is false where there is no matchMedia (jsdom, so the app tests stay wide)', () => {
    expect(renderHook(() => useNarrowLayout()).result.current).toBe(false)
  })

  it('follows the compact-layout media query as it changes', () => {
    const media = mockNarrowLayout(true)
    const { result } = renderHook(() => useNarrowLayout())
    expect(media.matchMedia).toHaveBeenCalledWith(NARROW_LAYOUT_QUERY)
    expect(result.current).toBe(true)

    act(() => media.set(false))
    expect(result.current).toBe(false)
  })

  it('covers a phone held upright and one on its side', () => {
    expect(NARROW_LAYOUT_QUERY).toContain('(max-width: 700px)')
    expect(NARROW_LAYOUT_QUERY).toContain('(max-height: 500px) and (pointer: coarse)')
  })
})
