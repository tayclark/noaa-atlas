// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { mockMatchMedia, unmockMatchMedia } from '../test/matchMedia'
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from './prefersReducedMotion'

afterEach(unmockMatchMedia)

describe('prefersReducedMotion', () => {
  it('is false where there is no matchMedia (jsdom)', () => {
    expect(prefersReducedMotion()).toBe(false)
  })

  it('reflects the prefers-reduced-motion media query', () => {
    const media = mockMatchMedia(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(media.matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY)
    media.set(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})
