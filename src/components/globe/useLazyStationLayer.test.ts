// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLazyStationLayer } from './useLazyStationLayer'

const toGeoJSON = (stations: string[]) => ({ type: 'FeatureCollection' as const, features: stations.map(() => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [0, 0] } })) })

function fakeMap() {
  const setData = vi.fn()
  const map = {
    getLayer: () => ({}),
    setLayoutProperty: vi.fn(),
    getSource: vi.fn(() => ({ setData })),
  }
  return { map, setData, ref: { current: map as never } }
}

function deferredLoader() {
  const calls: { resolve: (v: string[]) => void; reject: (e: unknown) => void }[] = []
  const load = vi.fn(() => new Promise<string[]>((resolve, reject) => calls.push({ resolve, reject })))
  return { load, calls }
}

function render(load: () => Promise<string[]>, ref: ReturnType<typeof fakeMap>['ref'], initial: { shown: boolean; mapLoaded?: boolean }) {
  return renderHook(
    ({ shown, mapLoaded }) => useLazyStationLayer(ref, mapLoaded, shown, 'layer', 'source', load, toGeoJSON),
    { initialProps: { mapLoaded: true, ...initial } },
  )
}

describe('useLazyStationLayer', () => {
  it('loads nothing until shown on a loaded map, then loads once into the source', async () => {
    const { ref, setData } = fakeMap()
    const { load, calls } = deferredLoader()
    const { result, rerender } = render(load, ref, { shown: false })
    expect(load).not.toHaveBeenCalled()
    rerender({ shown: true, mapLoaded: true })
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => calls[0].resolve(['a', 'b']))
    expect(result.current).toBe(2)
    expect(setData).toHaveBeenCalledTimes(1)
    rerender({ shown: false, mapLoaded: true })
    rerender({ shown: true, mapLoaded: true })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not load before the map has loaded', () => {
    const { ref } = fakeMap()
    const { load } = deferredLoader()
    render(load, ref, { shown: true, mapLoaded: false })
    expect(load).not.toHaveBeenCalled()
  })

  it('reports a failed load, forgets it once hidden, and retries on the next show', async () => {
    const { ref } = fakeMap()
    const { load, calls } = deferredLoader()
    const { result, rerender } = render(load, ref, { shown: true })
    await act(async () => calls[0].reject(new Error('down')))
    expect(result.current).toBe('error')
    rerender({ shown: false, mapLoaded: true })
    expect(result.current).toBeNull()
    rerender({ shown: true, mapLoaded: true })
    expect(load).toHaveBeenCalledTimes(2)
    await act(async () => calls[1].resolve(['a']))
    expect(result.current).toBe(1)
  })

  it('drops a list that arrives after the layer was hidden', async () => {
    const { ref, setData } = fakeMap()
    const { load, calls } = deferredLoader()
    const { result, rerender } = render(load, ref, { shown: true })
    rerender({ shown: false, mapLoaded: true })
    await act(async () => calls[0].resolve(['a']))
    expect(result.current).toBeNull()
    expect(setData).not.toHaveBeenCalled()
  })
})
