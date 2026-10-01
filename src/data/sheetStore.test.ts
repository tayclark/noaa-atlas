import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSheetBox, setSheetBox, subscribeSheetBox } from './sheetStore'

afterEach(() => setSheetBox(null))

describe('sheetStore', () => {
  it('starts with no sheet', () => {
    expect(getSheetBox()).toBeNull()
  })

  it('notifies subscribers when the sheet moves, rounded to whole pixels', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSheetBox(listener)
    setSheetBox({ edge: 'bottom', size: 123.6 })
    expect(getSheetBox()).toEqual({ edge: 'bottom', size: 124 })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setSheetBox({ edge: 'bottom', size: 200 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('tells a sheet on the right from one at the bottom', () => {
    setSheetBox({ edge: 'bottom', size: 150 })
    const listener = vi.fn()
    subscribeSheetBox(listener)
    setSheetBox({ edge: 'right', size: 150 })
    expect(getSheetBox()).toEqual({ edge: 'right', size: 150 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify, or change the object, when nothing moved', () => {
    setSheetBox({ edge: 'bottom', size: 80 })
    const before = getSheetBox()
    const listener = vi.fn()
    subscribeSheetBox(listener)
    setSheetBox({ edge: 'bottom', size: 80.2 })
    expect(listener).not.toHaveBeenCalled()
    expect(getSheetBox()).toBe(before)
  })

  it('treats no size, or a negative one, as no sheet', () => {
    setSheetBox({ edge: 'right', size: 300 })
    setSheetBox({ edge: 'right', size: 0 })
    expect(getSheetBox()).toBeNull()
    setSheetBox({ edge: 'bottom', size: -5 })
    expect(getSheetBox()).toBeNull()
    setSheetBox(null)
    expect(getSheetBox()).toBeNull()
  })
})
