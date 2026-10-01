import { describe, expect, it } from 'vitest'
import { OPEN_MARGIN, restingSnap, sheetHeights } from './sheetSnap'

const heights = sheetHeights(700, 124)

describe('sheetHeights', () => {
  it('peeks at the header and opens to all but a strip of the area', () => {
    expect(heights).toEqual([124, 700 - OPEN_MARGIN])
  })

  it('never peeks taller than the area, or opens shorter than it peeks', () => {
    expect(sheetHeights(100, 124)).toEqual([100, 100])
    expect(sheetHeights(150, 124)).toEqual([124, 124])
  })
})

describe('restingSnap', () => {
  it('stays at peek for a short slow drag up', () => {
    expect(restingSnap(124 + 60, 0, heights, 'peek')).toBe('peek')
  })

  it('opens when dragged past the middle', () => {
    expect(restingSnap(124 + 330, 0, heights, 'peek')).toBe('open')
  })

  it('opens on a flick up from peek even with little travel', () => {
    expect(restingSnap(124 + 20, 1.2, heights, 'peek')).toBe('open')
  })

  it('drops back to peek from open when dragged below the middle', () => {
    expect(restingSnap(644 - 400, 0, heights, 'open')).toBe('peek')
  })

  it('drops back to peek on a flick down from open', () => {
    expect(restingSnap(644 - 30, -2, heights, 'open')).toBe('peek')
  })

  it('keeps the sheet open for a small drag down from open', () => {
    expect(restingSnap(644 - 50, 0, heights, 'open')).toBe('open')
  })

  it('closes when pulled well below peek', () => {
    expect(restingSnap(124 - 70, 0, heights, 'peek')).toBe('close')
  })

  it('closes on a flick down from peek', () => {
    expect(restingSnap(124 - 10, -1, heights, 'peek')).toBe('close')
  })

  it('does not close for a slight pull below peek', () => {
    expect(restingSnap(124 - 20, 0, heights, 'peek')).toBe('peek')
  })

  it('never dismisses a sheet that began open, however hard the flick down', () => {
    expect(restingSnap(644 - 30, -6, heights, 'open')).toBe('peek')
  })

  it('has nowhere to open to when the area barely fits the header', () => {
    expect(restingSnap(100, 0, sheetHeights(100, 124), 'peek')).toBe('peek')
  })
})
