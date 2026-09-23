import { beforeEach, describe, expect, it, vi } from 'vitest'
import graphJson from './graph.json'
import type { ServiceNode } from './graphSchema'
import { parseGraphFile } from './graphSchema'
import { nodesCoveringPoint } from './coverageLookup'
import {
  clearSelection,
  getHighlightedNodeIds,
  getSelectionSnapshot,
  selectNode,
  selectPoint,
  subscribeSelection,
} from './selectionStore'

const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]
const kansas: [number, number] = [-98, 39] // covered by nws-api and spc-gis-data
const guineaGulf: [number, number] = [0, 0] // outside all region-limited coverage

beforeEach(() => {
  clearSelection()
})

describe('selectNode', () => {
  it('sets selectedNodeId and clears any prior selectedPoint', () => {
    selectPoint(kansas)
    selectNode('nws-api')
    expect(getSelectionSnapshot()).toEqual({ selectedNodeId: 'nws-api', selectedPoint: null })
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    subscribeSelection(listener)
    selectNode('nws-api')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('selectPoint', () => {
  it('sets selectedPoint and clears any prior selectedNodeId', () => {
    selectNode('nws-api')
    selectPoint(kansas)
    expect(getSelectionSnapshot()).toEqual({ selectedNodeId: null, selectedPoint: kansas })
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    subscribeSelection(listener)
    selectPoint(kansas)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('clearSelection', () => {
  it('resets both fields to null', () => {
    selectNode('nws-api')
    clearSelection()
    expect(getSelectionSnapshot()).toEqual({ selectedNodeId: null, selectedPoint: null })
  })

  it('notifies subscribers', () => {
    const listener = vi.fn()
    subscribeSelection(listener)
    selectNode('nws-api')
    clearSelection()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('subscribeSelection', () => {
  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSelection(listener)
    selectNode('nws-api')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    selectPoint(kansas)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('getSelectionSnapshot', () => {
  it('returns a stable reference when nothing has changed', () => {
    selectNode('nws-api')
    expect(getSelectionSnapshot()).toBe(getSelectionSnapshot())
  })

  it('returns a new reference after a mutation', () => {
    const before = getSelectionSnapshot()
    selectNode('nws-api')
    expect(getSelectionSnapshot()).not.toBe(before)
  })
})

describe('getHighlightedNodeIds', () => {
  it('returns an empty array when nothing is selected', () => {
    expect(getHighlightedNodeIds()).toEqual([])
  })

  it('returns just the selected node id after selectNode', () => {
    selectNode('nws-api')
    expect(getHighlightedNodeIds()).toEqual(['nws-api'])
  })

  it('returns the ids of all nodes covering the selected point', () => {
    selectPoint(kansas)
    const expected = nodesCoveringPoint(nodes, kansas).map((n) => n.id)
    expect(getHighlightedNodeIds().sort()).toEqual(expected.sort())
    expect(getHighlightedNodeIds()).toContain('nws-api')
    expect(getHighlightedNodeIds()).toContain('spc-gis-data')
  })

  it('returns an empty array when the selected point is outside all coverage', () => {
    selectPoint(guineaGulf)
    expect(getHighlightedNodeIds()).not.toContain('spc-gis-data')
    expect(getHighlightedNodeIds()).not.toContain('wpc-gis-products')
  })

  it('returns an empty array again after clearSelection', () => {
    selectNode('nws-api')
    clearSelection()
    expect(getHighlightedNodeIds()).toEqual([])
  })
})
