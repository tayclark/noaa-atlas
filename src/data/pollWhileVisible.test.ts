// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pollWhileVisible } from './pollWhileVisible'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('pollWhileVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks once per interval', () => {
    const tick = vi.fn()
    const stop = pollWhileVisible(tick, 1000)
    vi.advanceTimersByTime(3000)
    expect(tick).toHaveBeenCalledTimes(3)
    stop()
  })

  it('skips ticks while the tab is hidden', () => {
    const tick = vi.fn()
    const stop = pollWhileVisible(tick, 1000)
    setHidden(true)
    vi.advanceTimersByTime(3000)
    expect(tick).not.toHaveBeenCalled()
    stop()
  })

  it('ticks at once on return when the last tick is stale', () => {
    const tick = vi.fn()
    const stop = pollWhileVisible(tick, 1000)
    setHidden(true)
    vi.advanceTimersByTime(5000)
    setHidden(false)
    expect(tick).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not tick on return when the last tick is recent', () => {
    const tick = vi.fn()
    const stop = pollWhileVisible(tick, 1000)
    vi.advanceTimersByTime(1000)
    setHidden(true)
    vi.advanceTimersByTime(500)
    setHidden(false)
    expect(tick).toHaveBeenCalledTimes(1)
    stop()
  })

  it('stops ticking after cleanup', () => {
    const tick = vi.fn()
    const stop = pollWhileVisible(tick, 1000)
    stop()
    vi.advanceTimersByTime(3000)
    setHidden(true)
    setHidden(false)
    expect(tick).not.toHaveBeenCalled()
  })
})
