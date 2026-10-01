import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampToRange,
  getTimeSnapshot,
  resetTime,
  setPlaying,
  setRange,
  setTime,
  subscribeTime,
} from './timeStore'

afterEach(resetTime)

describe('timeStore', () => {
  it('starts at now, paused, with no range', () => {
    expect(getTimeSnapshot()).toEqual({ time: null, playing: false, range: null })
  })

  it('stores time, play state and range, and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTime(listener)
    setTime(1000)
    setPlaying(true)
    setRange({ start: 0, end: 5000 })
    expect(getTimeSnapshot()).toEqual({ time: 1000, playing: true, range: { start: 0, end: 5000 } })
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
    setTime(null)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('keeps the snapshot and skips notifying when nothing changed', () => {
    setRange({ start: 0, end: 5000 })
    const before = getTimeSnapshot()
    const listener = vi.fn()
    subscribeTime(listener)
    setTime(null)
    setPlaying(false)
    setRange({ start: 0, end: 5000 })
    expect(getTimeSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('clears the range with null', () => {
    setRange({ start: 0, end: 1 })
    setRange(null)
    expect(getTimeSnapshot().range).toBeNull()
  })

  it('clamps a time into a range', () => {
    const range = { start: 10, end: 20 }
    expect(clampToRange(5, range)).toBe(10)
    expect(clampToRange(15, range)).toBe(15)
    expect(clampToRange(25, range)).toBe(20)
  })
})
