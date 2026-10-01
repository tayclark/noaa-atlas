import { describe, expect, it } from 'vitest'
import { compassPoint, linePath, niceMax, scaleLinear, stepPath, timeToX } from './forecastChart'

describe('scaleLinear', () => {
  it('maps the domain onto the range, and can invert it', () => {
    expect(scaleLinear(0, 10, 0, 100)(5)).toBe(50)
    expect(scaleLinear(0, 10, 100, 0)(2)).toBe(80)
  })

  it('puts a flat domain in the middle', () => {
    expect(scaleLinear(3, 3, 0, 100)(3)).toBe(50)
  })
})

describe('linePath', () => {
  it('lifts the pen at gaps', () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, null, { x: 3, y: 4 }])).toBe('M0,1L1,2M3,4')
  })

  it('is empty without points', () => {
    expect(linePath([])).toBe('')
    expect(linePath([null])).toBe('')
  })
})

describe('stepPath', () => {
  it('holds each sample for its width and steps between them', () => {
    expect(stepPath([{ x: 0, y: 5 }, { x: 10, y: 8 }], 10)).toBe('M0,5L10,5L10,8L20,8')
  })

  it('starts again after a gap', () => {
    expect(stepPath([{ x: 0, y: 5 }, null, { x: 20, y: 8 }], 10)).toBe('M0,5L10,5M20,8L30,8')
  })
})

describe('niceMax', () => {
  it.each([
    [3, 10, 10],
    [11, 10, 15],
    [34, 10, 40],
    [1, 2, 2],
  ])('rounds %d (floor %d) up to %d', (max, floor, expected) => expect(niceMax(max, floor)).toBe(expected))
})

describe('compassPoint', () => {
  it.each([
    [0, 'N'],
    [225, 'SW'],
    [359, 'N'],
    [-90, 'W'],
  ])('names %d degrees', (degrees, name) => expect(compassPoint(degrees)).toBe(name))
})

describe('timeToX', () => {
  it('places a time on the chart and drops one outside it', () => {
    expect(timeToX(50, 0, 100, 10, 110)).toBe(60)
    expect(timeToX(150, 0, 100, 10, 110)).toBeNull()
    expect(timeToX(-1, 0, 100, 10, 110)).toBeNull()
  })
})
