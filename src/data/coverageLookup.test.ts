import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import type { Coverage, ServiceNode } from './graphSchema'
import { parseGraphFile } from './graphSchema'
import { isPointInCoverage, nodesCoveringPoint } from './coverageLookup'

const square = (west: number, south: number, east: number, north: number): [number, number][] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
]

describe('isPointInCoverage', () => {
  it('matches a point inside a simple Polygon and rejects one outside', () => {
    const coverage: Coverage = { type: 'Polygon', coordinates: [square(0, 0, 10, 10)] }
    expect(isPointInCoverage(coverage, [5, 5])).toBe(true)
    expect(isPointInCoverage(coverage, [20, 20])).toBe(false)
  })

  it('rejects points inside a hole and accepts points between the hole and the outer ring', () => {
    const coverage: Coverage = {
      type: 'Polygon',
      coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)],
    }
    expect(isPointInCoverage(coverage, [5, 5])).toBe(false) // inside the hole
    expect(isPointInCoverage(coverage, [1, 1])).toBe(true) // inside the outer ring, outside the hole
  })

  it('matches a point in either polygon of a MultiPolygon and rejects the gap between them', () => {
    const coverage: Coverage = {
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 2, 2)], [square(10, 10, 12, 12)]],
    }
    expect(isPointInCoverage(coverage, [11, 11])).toBe(true)
    expect(isPointInCoverage(coverage, [5, 5])).toBe(false)
  })

  it('is deterministic for a point exactly on an edge', () => {
    const coverage: Coverage = { type: 'Polygon', coordinates: [square(0, 0, 10, 10)] }
    // PNPOLY ray-casting treats this bottom-edge point as inside for this square's winding order.
    expect(isPointInCoverage(coverage, [5, 0])).toBe(true)
  })

  it('rejects a point far from a CONUS-shaped polygon', () => {
    const coverage: Coverage = {
      type: 'Polygon',
      coordinates: [square(-125, 25, -67, 49)],
    }
    expect(isPointInCoverage(coverage, [-160, 10])).toBe(false) // mid-Pacific
  })
})

describe('nodesCoveringPoint against real graph.json fixtures', () => {
  const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]
  const byId = (id: string) => nodes.find((n) => n.id === id)!

  it('covers a CONUS point with both nws-api and the CONUS-only spc-gis-data', () => {
    const kansas: [number, number] = [-98, 39]
    expect(isPointInCoverage(byId('nws-api').coverage, kansas)).toBe(true)
    expect(isPointInCoverage(byId('spc-gis-data').coverage, kansas)).toBe(true)
  })

  it('covers an Alaska point with nws-api but excludes the CONUS-only spc-gis-data', () => {
    const alaska: [number, number] = [-152, 64]
    expect(isPointInCoverage(byId('nws-api').coverage, alaska)).toBe(true)
    expect(isPointInCoverage(byId('spc-gis-data').coverage, alaska)).toBe(false)
  })

  it('excludes region-limited nodes for a point far from any coastal coverage', () => {
    const guineaGulf: [number, number] = [0, 0]
    const covering = nodesCoveringPoint(nodes, guineaGulf).map((n) => n.id)
    expect(covering).not.toContain('spc-gis-data')
    expect(covering).not.toContain('wpc-gis-products')
    // cpc-gis-data is authored as a full-world polygon, so it legitimately still matches.
    expect(covering).toContain('cpc-gis-data')
  })
})
