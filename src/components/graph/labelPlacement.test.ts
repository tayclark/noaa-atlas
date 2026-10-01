import { describe, expect, it } from 'vitest'
import { labelBudget, placeLabels, type LabelItem } from './labelPlacement'

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

  it('falls back to a diagonal only when all four sides are blocked (#145)', () => {
    // Small obstacles clip each side's label box but leave the diagonals clear.
    const sides = [
      { x0: 209, y0: 145, x1: 212, y1: 155 }, // right
      { x0: 188, y0: 145, x1: 191, y1: 155 }, // left
      { x0: 195, y0: 160, x1: 205, y1: 165 }, // below
      { x0: 195, y0: 135, x1: 205, y1: 140 }, // above
    ]
    expect(placeLabels([item('a', 200, 150)], bounds, sides).get('a')).toBe('upper-right')
    expect(placeLabels([item('a', 200, 150)], bounds, sides.slice(1)).get('a')).toBe('right')
  })

  it('never places a label over another node', () => {
    // A node sits right where "a"'s right-hand label would go.
    const result = placeLabels([item('a', 100, 50, 1), item('blocker', 130, 50, 0, 10)], bounds)
    expect(result.get('a')).toBe('left')
  })

  it('lets a label that fits nowhere clean graze a dot edge, but not reach a dot core (#176)', () => {
    // "a" can't go left (bounds), below or above (obstacles), so only the right is left, where a dot sits. The dot's own (oversized) label fits nowhere, so it can't block "a".
    const boxed = [
      { x0: 0, y0: 57, x1: 400, y1: 80 },
      { x0: 0, y0: 20, x1: 400, y1: 43 },
    ]
    const a = item('a', 50, 50)
    expect(placeLabels([a, item('edge', 56, 50, 0, 500)], bounds, boxed).get('a')).toBe('right')
    expect(placeLabels([a, item('core', 65, 50, 0, 500)], bounds, boxed).get('a')).toBeNull()
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

describe('label budget', () => {
  const spread = (priorities: number[], ranks: number[] = []) =>
    priorities.map((priority, i) => ({ ...item(`n${i}`, 20 + i * 70, 50, priority), rank: ranks[i] }))

  it('shows only the highest-ranked labels within the cap', () => {
    const items = spread([0, 0, 0, 0], [1, 4, 3, 2])
    const result = placeLabels(items, { width: 400, height: 100 }, [], 2)
    expect([...result].filter(([, side]) => side).map(([id]) => id).sort()).toEqual(['n1', 'n2'])
  })

  it('lets priority beat rank, and never caps the selection, search matches or hubs', () => {
    const items = spread([0, 5, 4, 3], [9, 0, 0, 0])
    const result = placeLabels(items, { width: 400, height: 100 }, [], 0)
    expect(result.get('n1')).toBeTruthy()
    expect(result.get('n2')).toBeTruthy()
    expect(result.get('n3')).toBeTruthy()
    expect(result.get('n0')).toBeNull()
  })

  it('grows the budget with zoom and never exceeds the node count', () => {
    expect(labelBudget(0.2, 100)).toBeLessThan(labelBudget(1, 100))
    expect(labelBudget(1, 100)).toBeLessThan(labelBudget(2, 100))
    expect(labelBudget(5, 40)).toBe(40)
    expect(labelBudget(0.01, 100)).toBeGreaterThan(0)
  })
})
