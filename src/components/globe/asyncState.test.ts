import { describe, expect, it } from 'vitest'
import { dataOf, errorOf, failedWith, loadedWith, LOADING, withEmpty } from './asyncState'

describe('asyncState', () => {
  it('reads the data or the error out of a state', () => {
    expect(dataOf(loadedWith([1]))).toEqual([1])
    expect(dataOf(LOADING)).toBeNull()
    expect(dataOf(failedWith('down'))).toBeNull()
    expect(errorOf(failedWith('down'))).toBe('down')
    expect(errorOf(loadedWith(1))).toBeNull()
  })

  it('reports loaded data with nothing in it as empty, and leaves every other state alone', () => {
    const isEmpty = (list: number[]) => list.length === 0
    expect(withEmpty(loadedWith([]), isEmpty)).toEqual({ status: 'empty' })
    expect(withEmpty(loadedWith([1]), isEmpty)).toEqual(loadedWith([1]))
    expect(withEmpty(LOADING, isEmpty)).toBe(LOADING)
    const error = failedWith('down')
    expect(withEmpty(error, isEmpty)).toBe(error)
  })
})
