// Test helper: jsdom has no matchMedia, so a test that needs a media query to match installs this
// stub. It answers `query` (every query, when none is given) with a list whose `matches` the test
// can flip, as a resize or rotation would; any other query never matches, as in jsdom without the
// stub. Call `unmockMatchMedia` in afterEach.

import { vi } from 'vitest'

export function mockMatchMedia(initial: boolean, query?: string) {
  let matches = initial
  const listeners = new Set<() => void>()
  const list = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  const otherQuery = { matches: false, addEventListener: () => {}, removeEventListener: () => {} }
  const matchMedia = vi.fn((asked: string) => (query === undefined || asked === query ? list : otherQuery))
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })
  return {
    matchMedia,
    /** Flips the answer and tells the listeners. */
    set(next: boolean) {
      matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

export function unmockMatchMedia() {
  delete (window as { matchMedia?: unknown }).matchMedia
}
