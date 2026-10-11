// @vitest-environment jsdom
import type { Map as MapLibreMap } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { addPointerCursor, setLayersVisible } from './mapLayers'

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
