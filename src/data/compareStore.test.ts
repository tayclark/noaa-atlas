import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCompare,
  clearCompare,
  getCompareSnapshot,
  MAX_COMPARE,
  removeCompare,
  subscribeCompare,
  toggleCompare,
} from './compareStore'
import graphJson from './graph.json'
import { parseGraphFile } from './graphSchema'

const nodes = parseGraphFile(graphJson).nodes
const services = nodes.filter((n) => n.kind === 'service').map((n) => n.id)
const theme = 'theme-weather' // a derived hub, not a service

beforeEach(clearCompare)

describe('compareStore', () => {
  it('toggles a service in and out', () => {
    toggleCompare(services[0]!)
    expect(getCompareSnapshot()).toEqual([services[0]])
    toggleCompare(services[0]!)
    expect(getCompareSnapshot()).toEqual([])
  })

  it('ignores unknown and non-service ids', () => {
    addCompare(['nope', theme])
    expect(getCompareSnapshot()).toEqual([])
  })

  it('adds in order without duplicates and stops at the cap', () => {
    addCompare([services[0]!, services[1]!, services[0]!])
    expect(getCompareSnapshot()).toEqual([services[0], services[1]])
    addCompare(services)
    expect(getCompareSnapshot()).toHaveLength(MAX_COMPARE)
    toggleCompare(services[MAX_COMPARE]!)
    expect(getCompareSnapshot()).toHaveLength(MAX_COMPARE)
  })

  it('removes one id and clears all', () => {
    addCompare([services[0]!, services[1]!])
    removeCompare(services[0]!)
    expect(getCompareSnapshot()).toEqual([services[1]])
    clearCompare()
    expect(getCompareSnapshot()).toEqual([])
  })

  it('notifies subscribers only on a change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeCompare(listener)
    removeCompare(services[0]!)
    expect(listener).not.toHaveBeenCalled()
    toggleCompare(services[0]!)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    toggleCompare(services[0]!)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
