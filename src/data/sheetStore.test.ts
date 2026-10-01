import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSheetHeight, setSheetHeight, subscribeSheetHeight } from './sheetStore'

afterEach(() => setSheetHeight(0))

describe('sheetStore', () => {
  it('starts with no sheet', () => {
    expect(getSheetHeight()).toBe(0)
  })

  it('notifies subscribers when the height changes, rounded to whole pixels', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSheetHeight(listener)
    setSheetHeight(123.6)
    expect(getSheetHeight()).toBe(124)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setSheetHeight(200)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify when the height is unchanged, and never goes negative', () => {
    setSheetHeight(80)
    const listener = vi.fn()
    subscribeSheetHeight(listener)
    setSheetHeight(80.2)
    expect(listener).not.toHaveBeenCalled()
    setSheetHeight(-5)
    expect(getSheetHeight()).toBe(0)
  })
})
