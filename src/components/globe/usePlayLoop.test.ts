// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayLoop } from './usePlayLoop'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('usePlayLoop', () => {
  it('does nothing while not running', () => {
    const onStep = vi.fn()
    renderHook(() => usePlayLoop(false, 0, 3, 100, onStep))
    vi.advanceTimersByTime(1000)
    expect(onStep).not.toHaveBeenCalled()
  })

  it('steps to the next frame each interval, following the index it is given', () => {
    const onStep = vi.fn()
    const { rerender } = renderHook(({ index }) => usePlayLoop(true, index, 3, 100, onStep), { initialProps: { index: 0 } })
    vi.advanceTimersByTime(100)
    expect(onStep).toHaveBeenLastCalledWith(1)
    rerender({ index: 1 })
    vi.advanceTimersByTime(100)
    expect(onStep).toHaveBeenLastCalledWith(2)
  })

  it('wraps from the last frame to the first, and stops when no longer running', () => {
    const onStep = vi.fn()
    const { rerender } = renderHook(({ running }) => usePlayLoop(running, 3, 3, 100, onStep), { initialProps: { running: true } })
    vi.advanceTimersByTime(100)
    expect(onStep).toHaveBeenLastCalledWith(0)
    rerender({ running: false })
    vi.advanceTimersByTime(500)
    expect(onStep).toHaveBeenCalledTimes(1)
  })
})
