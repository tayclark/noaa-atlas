// Test helper: jsdom has no matchMedia, so a test that needs the compact (phone) layout installs a
// stub that answers the layout query. Any other query (reduced motion, say) reports no match, so
// the components under test behave as they do in jsdom without the stub. Call `unmockNarrowLayout`
// in afterEach.

import { vi } from 'vitest'
import { NARROW_LAYOUT_QUERY } from './useNarrowLayout'

export function mockNarrowLayout(initial = true) {
  let matches = initial
  const listeners = new Set<() => void>()
  const layoutQuery = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }
  const otherQuery = { matches: false, addEventListener: () => {}, removeEventListener: () => {} }
  const matchMedia = vi.fn((query: string) => (query === NARROW_LAYOUT_QUERY ? layoutQuery : otherQuery))
  Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })
  return {
    matchMedia,
    /** Flips the layout, as a window resize or rotation would. */
    set(next: boolean) {
      matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

export function unmockNarrowLayout() {
  delete (window as { matchMedia?: unknown }).matchMedia
}
