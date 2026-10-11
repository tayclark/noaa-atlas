// @vitest-environment jsdom
import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { addLayerGroup, addPointerCursor, setLayersVisible } from './mapLayers'

function stubMap(layers: string[]) {
  const handlers = new Map<string, () => void>()
  const canvas = document.createElement('canvas')
  const map = {
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    setLayoutProperty: vi.fn(),
    on: (event: string, id: string, handler: () => void) => handlers.set(`${event}:${id}`, handler),
    getCanvas: () => canvas,
  }
  return { map, asMap: map as unknown as MapLibreMap, handlers, canvas }
}

describe('setLayersVisible', () => {
  it('sets the visibility of each layer on the map and skips the missing ones', () => {
    const { map, asMap } = stubMap(['a', 'b'])
    setLayersVisible(asMap, ['a', 'missing', 'b'], true)
    expect(map.setLayoutProperty.mock.calls).toEqual([
      ['a', 'visibility', 'visible'],
      ['b', 'visibility', 'visible'],
    ])
    setLayersVisible(asMap, ['a'], false)
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith('a', 'visibility', 'none')
  })
})

describe('addPointerCursor', () => {
  it('shows a pointer while the mouse is over each layer', () => {
    const { asMap, handlers, canvas } = stubMap([])
    addPointerCursor(asMap, ['a', 'b'])
    expect([...handlers.keys()]).toEqual(['mouseenter:a', 'mouseleave:a', 'mouseenter:b', 'mouseleave:b'])
    handlers.get('mouseenter:b')!()
    expect(canvas.style.cursor).toBe('pointer')
    handlers.get('mouseleave:b')!()
    expect(canvas.style.cursor).toBe('')
  })
})

describe('addLayerGroup', () => {
  it('adds the source and then each layer in order, under the given layer', () => {
    const calls: unknown[][] = []
    const map = {
      addSource: (...args: unknown[]) => calls.push(['addSource', ...args]),
      addLayer: (...args: unknown[]) => calls.push(['addLayer', ...args]),
    } as unknown as MapLibreMap
    const source = { type: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } }
    const a = { id: 'a', type: 'fill' as const, source: 's' }
    const b = { id: 'b', type: 'line' as const, source: 's' }
    addLayerGroup(map, { sourceId: 's', source, layers: [a, b] }, 'top')
    expect(calls).toEqual([
      ['addSource', 's', source],
      ['addLayer', a, 'top'],
      ['addLayer', b, 'top'],
    ])
  })
})
