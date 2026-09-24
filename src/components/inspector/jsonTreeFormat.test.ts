import { describe, expect, it } from 'vitest'
import { ARRAY_PAGE_SIZE, isContainer, summarizeJson, visibleChildren } from './jsonTreeFormat'

describe('summarizeJson', () => {
  it('counts keys and items, singular and plural', () => {
    expect(summarizeJson({ a: 1 })).toBe('{…} 1 key')
    expect(summarizeJson({ a: 1, b: 2, c: 3 })).toBe('{…} 3 keys')
    expect(summarizeJson([1])).toBe('[…] 1 item')
    expect(summarizeJson(new Array(467).fill(0))).toBe('[…] 467 items')
  })

  it('shows empty containers literally', () => {
    expect(summarizeJson({})).toBe('{}')
    expect(summarizeJson([])).toBe('[]')
  })

  it('shows primitives as JSON, strings quoted', () => {
    expect(summarizeJson('Tornado Warning')).toBe('"Tornado Warning"')
    expect(summarizeJson(42)).toBe('42')
    expect(summarizeJson(false)).toBe('false')
    expect(summarizeJson(null)).toBe('null')
    expect(summarizeJson(undefined)).toBe('undefined')
  })
})

describe('isContainer', () => {
  it('is true for objects and arrays only', () => {
    expect(isContainer({})).toBe(true)
    expect(isContainer([])).toBe(true)
    expect(isContainer(null)).toBe(false)
    expect(isContainer('x')).toBe(false)
  })
})

describe('visibleChildren', () => {
  it('shows every key of an object', () => {
    expect(visibleChildren({ a: 1, b: 2 }, 1)).toEqual({ entries: [['a', 1], ['b', 2]], hidden: 0 })
  })

  it('cuts a long array to the limit and counts the rest', () => {
    const items = Array.from({ length: 45 }, (_, i) => i)
    const { entries, hidden } = visibleChildren(items, ARRAY_PAGE_SIZE)
    expect(entries).toHaveLength(ARRAY_PAGE_SIZE)
    expect(entries[0]).toEqual(['0', 0])
    expect(hidden).toBe(45 - ARRAY_PAGE_SIZE)
  })

  it('shows a short array whole', () => {
    expect(visibleChildren(['x', 'y'], ARRAY_PAGE_SIZE)).toEqual({ entries: [['0', 'x'], ['1', 'y']], hidden: 0 })
  })
})
