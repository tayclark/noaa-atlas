// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from './prefersReducedMotion'

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
})

const stubMatchMedia = (matches: boolean) => {
  const matchMedia = vi.fn(() => ({ matches }))
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })
  return matchMedia
}

describe('prefersReducedMotion', () => {
  it('is false where there is no matchMedia (jsdom)', () => {
    expect(prefersReducedMotion()).toBe(false)
  })

  it('reflects the prefers-reduced-motion media query', () => {
    const matchMedia = stubMatchMedia(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY)
    stubMatchMedia(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})
