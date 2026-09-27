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

  // Real outlines rather than boxes (#163): land plus the EEZ, the waters alone, one region, two satellite views.
  it('covers US coastal waters and the territories with nws-api, but not Mexico or Canada', () => {
    const nws = byId('nws-api').coverage
    for (const [name, point] of Object.entries({ offNewJersey: [-73.4, 39.6], guam: [144.79, 13.47], pagoPago: [-170.7, -14.28], sanJuan: [-66.1, 18.45] })) {
      expect(isPointInCoverage(nws, point as [number, number]), name).toBe(true)
    }
    expect(isPointInCoverage(nws, [-99.1, 19.4])).toBe(false) // Mexico City
    expect(isPointInCoverage(nws, [-79.4, 43.7])).toBe(false) // Toronto
  })

  it('covers the water, not inland, for the CO-OPS tide APIs', () => {
    const coops = byId('coops-data-api').coverage
    expect(isPointInCoverage(coops, [-68.5, 43])).toBe(true) // Gulf of Maine
    expect(isPointInCoverage(coops, [-87, 43.5])).toBe(true) // Lake Michigan
    expect(isPointInCoverage(coops, [-98, 38.5])).toBe(false) // Kansas
    expect(isPointInCoverage(coops, [-87, 48.3])).toBe(false) // the Canadian side of Lake Superior
  })

  it('limits the Northeast Fisheries Science Center to the Northeast shelf', () => {
    const nefsc = byId('nefsc-erddap').coverage
    expect(isPointInCoverage(nefsc, [-68.5, 43])).toBe(true) // Gulf of Maine
    expect(isPointInCoverage(nefsc, [-86, 27])).toBe(false) // Gulf of Mexico
  })

  // Ocean basins rather than boxes (#170): water only, so continents fall outside.
  it('covers the NHC area: the Atlantic, Gulf and Caribbean, and the eastern Pacific', () => {
    const nhc = byId('nhc-active-storms').coverage
    for (const [name, point] of Object.entries({ gulf: [-90, 25], caribbean: [-75, 15], easternPacific: [-110, 12], offWestAfrica: [-20, 15] })) {
      expect(isPointInCoverage(nhc, point as [number, number]), name).toBe(true)
    }
    expect(isPointInCoverage(nhc, [-160, 15])).toBe(false) // Central Pacific
    expect(isPointInCoverage(nhc, [-98, 38.5])).toBe(false) // Kansas
    expect(isPointInCoverage(nhc, [18, 35])).toBe(false) // Mediterranean
  })

  it('covers the Pacific and the Atlantic for the tsunami feeds, not the Indian Ocean', () => {
    const tsunami = byId('tsunami-warning-feeds').coverage
    for (const [name, point] of Object.entries({ offHawaii: [-158, 18], offJapan: [150, 35], caribbean: [-75, 15], samoa: [-172, -15] })) {
      expect(isPointInCoverage(tsunami, point as [number, number]), name).toBe(true)
    }
    expect(isPointInCoverage(tsunami, [80, -10])).toBe(false) // Indian Ocean
    expect(isPointInCoverage(tsunami, [-98, 38.5])).toBe(false) // Kansas
  })

  it('covers every basin with a DART buoy, including the Indian Ocean', () => {
    const dart = byId('ndbc-dart-realtime').coverage
    for (const [name, point] of Object.entries({ bayOfBengal: [88.5, 10.2], aleutians: [-164.1, 50.9], offChile: [-73.8, -32.1], gulf: [-89.3, 25.8] })) {
      expect(isPointInCoverage(dart, point as [number, number]), name).toBe(true)
    }
    expect(isPointInCoverage(dart, [-98, 38.5])).toBe(false) // Kansas
    expect(isPointInCoverage(dart, [18, 35])).toBe(false) // Mediterranean
  })

  it('covers the GOES-East and GOES-West views, including Alaska, but not Europe or Japan', () => {
    const goes = byId('goes-aws-open-data').coverage
    expect(isPointInCoverage(goes, [-149.9, 61.2])).toBe(true) // Anchorage
    expect(isPointInCoverage(goes, [-46.6, -23.5])).toBe(true) // São Paulo
    expect(isPointInCoverage(goes, [-0.1, 51.5])).toBe(false) // London
    expect(isPointInCoverage(goes, [139.7, 35.7])).toBe(false) // Tokyo
  })
})
