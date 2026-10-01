import { describe, expect, it } from 'vitest'
import { formatWindTime, windBlend, windIndexForTime, windTimes } from './windTime'

const CYCLE = Date.parse('2026-10-01T00:00:00Z')
const H = 3_600_000

describe('windBlend', () => {
  it('brackets a time between two 3-hourly files', () => {
    const b = windBlend(CYCLE, CYCLE + 4 * H)
    expect(b).toMatchObject({ hourA: 3, hourB: 6 })
    expect(b.t).toBeCloseTo(1 / 3)
  })

  it('is exact on a file hour', () => {
    expect(windBlend(CYCLE, CYCLE + 12 * H)).toEqual({ hourA: 12, hourB: 15, t: 0 })
  })

  it('clamps before the cycle and after the last file', () => {
    expect(windBlend(CYCLE, CYCLE - 10 * H)).toEqual({ hourA: 0, hourB: 3, t: 0 })
    expect(windBlend(CYCLE, CYCLE + 500 * H)).toEqual({ hourA: 120, hourB: 120, t: 0 })
  })
})

describe('slider mapping', () => {
  it('lists 41 steps from the cycle to +120 h', () => {
    const times = windTimes(CYCLE)
    expect(times).toHaveLength(41)
    expect(times[0]).toBe(CYCLE)
    expect(times[40]).toBe(CYCLE + 120 * H)
  })

  it('finds the nearest index and clamps', () => {
    expect(windIndexForTime(CYCLE, CYCLE + 7 * H)).toBe(2)
    expect(windIndexForTime(CYCLE, CYCLE - 99 * H)).toBe(0)
    expect(windIndexForTime(CYCLE, CYCLE + 999 * H)).toBe(40)
  })

  it('labels with the lead time', () => {
    expect(formatWindTime(CYCLE, CYCLE + 12 * H)).toMatch(/\+12 h$/)
    expect(formatWindTime(CYCLE, CYCLE - 3 * H)).toMatch(/-3 h$/)
  })
})
