import { describe, expect, it } from 'vitest'
import { focusIds, isEdgeDimmed, isNodeDimmed } from './focusDim'

describe('focusIds', () => {
  it('is null with no search and no selection', () => {
    expect(focusIds(null, [])).toBeNull()
  })

  it('is the highlighted ids for a selection', () => {
    expect(focusIds(null, ['a', 'b'])).toEqual(new Set(['a', 'b']))
  })

  it('unions search matches with the selection so a selected node never dims', () => {
    expect(focusIds(new Set(['m']), ['a'])).toEqual(new Set(['m', 'a']))
  })

  it('keeps an empty search result dimming everything except the selection', () => {
    expect(focusIds(new Set(), [])).toEqual(new Set())
  })
})

describe('isNodeDimmed', () => {
  it('dims only nodes outside a focus set', () => {
    expect(isNodeDimmed(null, 'a')).toBe(false)
    expect(isNodeDimmed(new Set(['a']), 'a')).toBe(false)
    expect(isNodeDimmed(new Set(['a']), 'b')).toBe(true)
  })
})

describe('isEdgeDimmed', () => {
  it('never dims without a focus', () => {
    expect(isEdgeDimmed(null, null, [], 'a', 'b')).toBe(false)
  })

  it('keeps an edge touching the selected node', () => {
    const focus = focusIds(null, ['a'])
    expect(isEdgeDimmed(focus, null, ['a'], 'a', 'b')).toBe(false)
    expect(isEdgeDimmed(focus, null, ['a'], 'c', 'd')).toBe(true)
  })

  it('keeps an edge between two path nodes', () => {
    const focus = focusIds(null, ['a', 'b'])
    expect(isEdgeDimmed(focus, null, ['a', 'b'], 'a', 'b')).toBe(false)
  })

  it('under search requires both ends to be in focus', () => {
    const matched = new Set(['m', 'n'])
    const focus = focusIds(matched, ['a'])
    expect(isEdgeDimmed(focus, matched, ['a'], 'm', 'n')).toBe(false)
    expect(isEdgeDimmed(focus, matched, ['a'], 'a', 'z')).toBe(true)
    expect(isEdgeDimmed(focus, matched, ['a'], 'm', 'z')).toBe(true)
  })
})
