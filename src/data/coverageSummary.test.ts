import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import type { Coverage, ServiceNode } from './graphSchema'
import { parseGraphFile } from './graphSchema'
import { summarizeCoverage } from './coverageSummary'

const square = (west: number, south: number, east: number, north: number): [number, number][] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
]

describe('summarizeCoverage', () => {
  it('formats a simple Polygon as a lat/lon bbox range', () => {
    const coverage: Coverage = { type: 'Polygon', coordinates: [square(-125, 25, -67, 49)] }
    expect(summarizeCoverage(coverage)).toBe('~125°W–67°W, 25°N–49°N')
  })

  it('spans across the union of every polygon in a MultiPolygon', () => {
    const coverage: Coverage = {
      type: 'MultiPolygon',
      coordinates: [[square(-170, 51, -130, 71)], [square(-125, 25, -67, 49)]],
    }
    expect(summarizeCoverage(coverage)).toBe('~170°W–67°W, 25°N–71°N')
  })

  it('ignores an inner hole ring when computing the bbox', () => {
    const coverage: Coverage = {
      type: 'Polygon',
      coordinates: [square(-125, 25, -67, 49), square(-100, 30, -90, 35)],
    }
    expect(summarizeCoverage(coverage)).toBe('~125°W–67°W, 25°N–49°N')
  })

  it('formats real graph.json coverage without throwing, as a drift guard', () => {
    const nodes = parseGraphFile(graphJson).nodes as ServiceNode[]
    for (const node of nodes) {
      expect(summarizeCoverage(node.coverage)).toMatch(/^~\d+°[WE]–\d+°[WE], \d+°[NS]–\d+°[NS]$/)
    }
  })
})
