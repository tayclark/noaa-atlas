import { describe, expect, it } from 'vitest'
import graphJson from '../../data/graph.json'
import type { Coverage, ServiceNode } from '../../data/graphSchema'
import { parseGraphFile } from '../../data/graphSchema'
import { coverageFlyTarget } from './coverageFlyTarget'

const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]
const coverageOf = (id: string): Coverage => {
  const node = nodes.find((n) => n.id === id)
  if (!node) throw new Error(`fixture node "${id}" not found in graph.json`)
  return node.coverage
}
const rings = (west: number, south: number, east: number, north: number): [number, number][][] => [
  [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ],
]
const box = (west: number, south: number, east: number, north: number): Coverage => ({
  type: 'Polygon',
  coordinates: rings(west, south, east, north),
})

describe('coverageFlyTarget', () => {
  it('frames a single region by its own bounds', () => {
    expect(coverageFlyTarget([box(-125, 24, -66, 50)])).toEqual({ kind: 'bounds', bounds: [-125, 24, -66, 50] })
  })

  it('frames US coverage across the antimeridian instead of the whole world (nws-api)', () => {
    const target = coverageFlyTarget([coverageOf('nws-api')])
    if (target?.kind !== 'bounds') throw new Error('expected bounds')
    const [west, south, east, north] = target.bounds
    // From the Aleutians west of 180°, eastward over the dateline, to the US east coast.
    expect(west).toBeGreaterThan(160)
    expect(east).toBeGreaterThan(280)
    expect(east - west).toBeLessThan(150)
    expect(south).toBeGreaterThan(10)
    expect(north).toBeGreaterThan(70)
  })

  it('leaves tiny outlying polygons out of the framing', () => {
    const target = coverageFlyTarget([
      { type: 'MultiPolygon', coordinates: [rings(-125, 24, -66, 50), rings(144, 13, 145, 14)] },
    ])
    expect(target).toEqual({ kind: 'bounds', bounds: [-125, 24, -66, 50] })
  })

  it('reports worldwide coverage as global', () => {
    expect(coverageFlyTarget([coverageOf('gfs-aws-open-data')])).toEqual({ kind: 'global' })
  })

  it('reports coverage that leaves only a narrow gap as global', () => {
    expect(coverageFlyTarget([box(-180, -60, 150, 60)])).toEqual({ kind: 'global' })
  })

  it('combines several geometries, such as a task path', () => {
    const target = coverageFlyTarget([box(-125, 24, -66, 50), box(-160, 18, -154, 23)])
    expect(target).toEqual({ kind: 'bounds', bounds: [-160, 18, -66, 50] })
  })

  it('returns null when there is nothing to frame', () => {
    expect(coverageFlyTarget([])).toBeNull()
  })

  it('never frames a real node as the whole -180..180 world', () => {
    for (const node of nodes) {
      const target = coverageFlyTarget([node.coverage])
      if (target?.kind === 'bounds') expect(target.bounds[2] - target.bounds[0]).toBeLessThan(300)
    }
  })
})
