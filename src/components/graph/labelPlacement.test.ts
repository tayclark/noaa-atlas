import { describe, expect, it } from 'vitest'
import { placeLabels, type LabelItem } from './labelPlacement'

const item = (id: string, x: number, y: number, priority = 0, width = 60): LabelItem => ({
  id,
  x,
  y,
  radius: 5,
  width,
  height: 14,
  priority,
})

const bounds = { width: 400, height: 300 }

describe('placeLabels', () => {
  it('places non-conflicting labels to the right', () => {
    const result = placeLabels([item('a', 50, 50), item('b', 50, 150)], bounds)
    expect(result.get('a')).toBe('right')
    expect(result.get('b')).toBe('right')
  })

  it('lets the higher-priority label win a contested spot and moves the other to the left', () => {
    const result = placeLabels([item('low', 100, 50, 0), item('high', 100, 55, 2)], bounds)
    expect(result.get('high')).toBe('right')
    expect(result.get('low')).toBe('left')
  })

  it('falls back to the left at the right edge instead of clipping', () => {
    expect(placeLabels([item('edge', 380, 50)], bounds).get('edge')).toBe('left')
  })

  it('tries below, then above, when neither side fits, and hides the label when nothing does', () => {
    // A 60px label on a node centred in a 100px-wide canvas can't fit to either side.
    const narrow = { width: 100, height: 300 }
    expect(placeLabels([item('mid', 50, 50)], narrow).get('mid')).toBe('below')
    expect(placeLabels([item('bottom', 50, 290)], narrow).get('bottom')).toBe('above')
    expect(placeLabels([item('none', 50, 50)], { width: 100, height: 20 }).get('none')).toBeNull()
  })

  it('never places a label over another node', () => {
    // A node sits right where "a"'s right-hand label would go.
    const result = placeLabels([item('a', 100, 50, 1), item('blocker', 130, 50, 0, 10)], bounds)
    expect(result.get('a')).toBe('left')
  })

  it('lets an overNodes label cover another node but not another label', () => {
    const blocker = item('blocker', 130, 50, 0, 10)
    expect(placeLabels([{ ...item('hub', 100, 50, 3), overNodes: true }, blocker], bounds).get('hub')).toBe('right')
  })

  it('keeps labels out of obstacle areas', () => {
    const panel = { x0: 100, y0: 0, x1: 400, y1: 300 }
    expect(placeLabels([item('a', 90, 50)], bounds, [panel]).get('a')).toBe('left')
  })

  it('is deterministic for equal priorities regardless of input order', () => {
    const items = [item('b', 100, 50), item('a', 100, 52), item('c', 100, 54)]
    expect([...placeLabels(items, bounds)].sort()).toEqual([...placeLabels([...items].reverse(), bounds)].sort())
  })
})
