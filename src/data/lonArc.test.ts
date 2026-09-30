import { describe, expect, it } from 'vitest'
import { smallestLonArc, wrapLon } from './lonArc'

describe('smallestLonArc', () => {
  it('returns null for no intervals', () => {
    expect(smallestLonArc([])).toBeNull()
  })

  it('returns a single interval as is, with the gap round the back', () => {
    expect(smallestLonArc([[-125, -66]])).toEqual({ west: -125, east: -66, gap: 301 })
  })

  it('merges overlapping intervals', () => {
    expect(smallestLonArc([[-125, -90], [-100, -66]])).toEqual({ west: -125, east: -66, gap: 301 })
  })

  it('crosses the antimeridian when that is the smaller arc', () => {
    // Alaska-side and Asia-side pieces: the gap is over the Atlantic, so the arc runs 150E..-130 (as 230).
    expect(smallestLonArc([[-180, -130], [150, 180]])).toEqual({ west: 150, east: 230, gap: 280 })
  })

  it('reports a full circle as a zero gap', () => {
    expect(smallestLonArc([[-180, 180]])).toEqual({ west: -180, east: 180, gap: 0 })
  })
})

describe('wrapLon', () => {
  it('keeps longitudes already in range, including the edges', () => {
    expect([-180, -10, 0, 180].map(wrapLon)).toEqual([-180, -10, 0, 180])
  })

  it('wraps longitudes from a repeated world', () => {
    expect(wrapLon(190)).toBe(-170)
    expect(wrapLon(-200)).toBe(160)
    expect(wrapLon(540)).toBe(-180)
  })
})
