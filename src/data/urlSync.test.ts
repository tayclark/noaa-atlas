// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSelection, getSelectionSnapshot, selectNode, selectPoint, selectTask } from './selectionStore'
import { startUrlSync } from './urlSync'

let stop: (() => void) | null = null

function start() {
  stop = startUrlSync()
}

beforeEach(() => {
  clearSelection()
  history.replaceState(null, '', '/noaa-atlas/?q=1')
})

afterEach(() => {
  stop?.()
  stop = null
  clearSelection()
})

describe('startUrlSync', () => {
  it('selects what the page was opened with', () => {
    history.replaceState(null, '', '/noaa-atlas/#node=nws-api')
    start()
    expect(getSelectionSnapshot().selectedNodeId).toBe('nws-api')
    expect(location.hash).toBe('#node=nws-api')
  })

  it('selects a linked task or point', () => {
    history.replaceState(null, '', '/#task=local-forecast')
    start()
    expect(getSelectionSnapshot().selectedTaskId).toBe('local-forecast')
    stop?.()
    history.replaceState(null, '', '/#point=-97.09,39.75')
    start()
    expect(getSelectionSnapshot().selectedPoint).toEqual([-97.09, 39.75])
  })

  it('drops an unknown id from the address and selects nothing', () => {
    history.replaceState(null, '', '/noaa-atlas/?q=1#node=nope')
    start()
    expect(getSelectionSnapshot().selectedNodeId).toBeNull()
    expect(location.hash).toBe('')
    expect(location.pathname + location.search).toBe('/noaa-atlas/?q=1')
  })

  it('pushes a node or task selection, and replaces a point or a clear', () => {
    start()
    const before = history.length
    selectNode('nws-api')
    expect(location.hash).toBe('#node=nws-api')
    selectTask('local-forecast')
    expect(location.hash).toBe('#task=local-forecast')
    expect(history.length).toBe(before + 2)
    selectPoint([-97.0912345, 39.75])
    expect(location.hash).toBe('#point=-97.0912,39.75')
    clearSelection()
    expect(location.hash).toBe('')
    expect(location.pathname + location.search).toBe('/noaa-atlas/?q=1')
    expect(history.length).toBe(before + 2)
  })

  it('applies the address on Back or Forward', () => {
    start()
    history.replaceState(null, '', '/#node=nws-api')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(getSelectionSnapshot().selectedNodeId).toBe('nws-api')
    history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(getSelectionSnapshot().selectedNodeId).toBeNull()
  })

  it('stops following the selection once stopped', () => {
    start()
    stop?.()
    stop = null
    selectNode('nws-api')
    expect(location.hash).toBe('')
  })
})
