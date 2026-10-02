import { describe, expect, it } from 'vitest'
import { isSamePlace, needsLinkedLookup } from './linkedPoint'

describe('isSamePlace', () => {
  it('matches the same position, and one wrapped by whole turns of longitude', () => {
    expect(isSamePlace([-97.09, 39.75], [-97.09, 39.75])).toBe(true)
    expect(isSamePlace([-97.09, 39.75], [262.91, 39.75])).toBe(true)
    expect(isSamePlace([179.5, 0], [-540.5, 0])).toBe(true)
  })

  it('tells different places apart', () => {
    expect(isSamePlace([-97.09, 39.75], [-97.1, 39.75])).toBe(false)
    expect(isSamePlace([-97.09, 39.75], [-97.09, 39.76])).toBe(false)
    expect(isSamePlace([0, 0], [180, 0])).toBe(false)
  })
})

describe('needsLinkedLookup', () => {
  it('looks up a selected point that has no popup over it', () => {
    expect(needsLinkedLookup([-97.09, 39.75], null)).toBe(true)
    expect(needsLinkedLookup([-97.09, 39.75], [-120, 45])).toBe(true)
  })

  it('leaves a point the globe opened its own popup for, and no point at all', () => {
    expect(needsLinkedLookup([-97.09, 39.75], [-97.09, 39.75])).toBe(false)
    expect(needsLinkedLookup(null, null)).toBe(false)
  })
})
