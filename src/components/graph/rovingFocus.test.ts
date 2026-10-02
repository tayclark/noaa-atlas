import { describe, expect, it } from 'vitest'
import type { LayoutNode } from './graphLayout'
import { revealTransform, rovingOrder, rovingTabStop, rovingTarget } from './rovingFocus'

const service = (id: string, name: string, theme: string) => ({ id, kind: 'service', name, theme }) as unknown as LayoutNode
const nodes: LayoutNode[] = [
  service('tides', 'Tides', 'ocean'),
  { id: 'theme-ocean', kind: 'theme', name: 'Ocean & coastal', theme: 'ocean' },
  service('nws', 'NWS API', 'weather'),
  { id: 'office-nos', kind: 'office', name: 'NOS', office: 'NOS' } as LayoutNode,
  service('alerts', 'Alerts', 'weather'),
  { id: 'theme-weather', kind: 'theme', name: 'Weather & forecast', theme: 'weather' },
  { id: 'noaa', kind: 'root', name: 'NOAA' } as LayoutNode,
]

describe('rovingOrder', () => {
  it('puts the root first, then each theme in THEMES order with its hub ahead of its services by name', () => {
    expect(rovingOrder(nodes, 'theme')).toEqual(['noaa', 'theme-weather', 'alerts', 'nws', 'theme-ocean', 'tides'])
  })

  it('leaves out nodes the mode hides and the org hubs, which are never focusable', () => {
    expect(rovingOrder(nodes, 'org')).toEqual(['noaa', 'alerts', 'nws', 'tides'])
  })
})

describe('rovingTabStop', () => {
  const order = ['a', 'b', 'c']

  it('prefers the node last focused, then the selection, then the first node', () => {
    expect(rovingTabStop(order, 'c', 'b')).toBe('c')
    expect(rovingTabStop(order, null, 'b')).toBe('b')
    expect(rovingTabStop(order, null, null)).toBe('a')
  })

  it('skips ids that are not in the order, such as a node the current mode hides', () => {
    expect(rovingTabStop(order, 'hidden', 'also-hidden')).toBe('a')
    expect(rovingTabStop([], 'a', 'b')).toBeNull()
  })
})

describe('rovingTarget', () => {
  const order = ['a', 'b', 'c']

  it('moves to the next and previous node, wrapping at both ends', () => {
    expect(rovingTarget(order, 'a', 'ArrowRight')).toBe('b')
    expect(rovingTarget(order, 'c', 'ArrowDown')).toBe('a')
    expect(rovingTarget(order, 'b', 'ArrowLeft')).toBe('a')
    expect(rovingTarget(order, 'a', 'ArrowUp')).toBe('c')
  })

  it('jumps to the first and last node with Home and End', () => {
    expect(rovingTarget(order, 'b', 'Home')).toBe('a')
    expect(rovingTarget(order, 'b', 'End')).toBe('c')
  })

  it('starts from the ends when the current node is not in the order', () => {
    expect(rovingTarget(order, 'gone', 'ArrowRight')).toBe('a')
    expect(rovingTarget(order, 'gone', 'ArrowLeft')).toBe('c')
  })

  it('ignores other keys and an empty order', () => {
    expect(rovingTarget(order, 'a', 'Enter')).toBeNull()
    expect(rovingTarget([], 'a', 'ArrowRight')).toBeNull()
  })
})

describe('revealTransform', () => {
  const view = { x: 0, y: 0, k: 2 }

  it('leaves a node that is already in view alone', () => {
    expect(revealTransform(view, { x: 100, y: 100 }, 600, 400, 40)).toBeNull()
  })

  it('pans just far enough to bring a node inside the margin, keeping the scale', () => {
    // At k=2 the node at x=400 is at screen x=800, past the 560 px limit of a 600 px view.
    expect(revealTransform(view, { x: 400, y: 100 }, 600, 400, 40)).toEqual({ x: -240, y: 0, k: 2 })
    // At y=-50 it is at screen y=-100, above the 40 px margin.
    expect(revealTransform(view, { x: 100, y: -50 }, 600, 400, 40)).toEqual({ x: 0, y: 140, k: 2 })
  })

  it('keeps the node out from under the detail panel', () => {
    // The panel covers the right 250 px, so the node at screen x=500 moves left to 600-250-40=310.
    const inset = { left: 0, top: 0, right: 250, bottom: 0 }
    expect(revealTransform(view, { x: 250, y: 100 }, 600, 400, 40, inset)).toEqual({ x: -190, y: 0, k: 2 })
  })

  it('centres the node on an axis narrower than two margins', () => {
    expect(revealTransform({ x: 0, y: 0, k: 1 }, { x: 100, y: 10 }, 60, 400, 40)).toEqual({ x: -70, y: 30, k: 1 })
  })
})
