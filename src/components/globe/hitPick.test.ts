import { describe, expect, it } from 'vitest'
import { hitBox, hitPadding, MOUSE_HIT_PADDING, nearestCandidate, TOUCH_HIT_PADDING } from './hitPick'

describe('hitPadding', () => {
  it('reaches further for a finger than for a mouse', () => {
    expect(hitPadding(false)).toBe(MOUSE_HIT_PADDING)
    expect(hitPadding(true)).toBe(TOUCH_HIT_PADDING)
    expect(TOUCH_HIT_PADDING).toBeGreaterThan(MOUSE_HIT_PADDING)
  })
})

describe('hitBox', () => {
  it('is the padded square around a point, as two corners', () => {
    expect(hitBox({ x: 100, y: 50 }, 20)).toEqual([
      [80, 30],
      [120, 70],
    ])
  })
})

describe('nearestCandidate', () => {
  const candidates = [
    { feature: 'a', x: 100, y: 100 },
    { feature: 'b', x: 130, y: 100 },
    { feature: 'c', x: 100, y: 160 },
  ]

  it('picks the feature drawn nearest the tap', () => {
    expect(nearestCandidate(candidates, { x: 104, y: 98 })).toBe('a')
    expect(nearestCandidate(candidates, { x: 124, y: 100 })).toBe('b')
    expect(nearestCandidate(candidates, { x: 100, y: 150 })).toBe('c')
  })

  it('takes the first of two equally near', () => {
    expect(nearestCandidate(candidates, { x: 115, y: 100 })).toBe('a')
  })

  it('finds nothing among no candidates', () => {
    expect(nearestCandidate([], { x: 0, y: 0 })).toBeNull()
  })
})
