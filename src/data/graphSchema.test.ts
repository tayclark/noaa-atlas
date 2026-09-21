import { describe, expect, it } from 'vitest'
import graphJson from './graph.json'
import { CONUS_RING, makeEdge, makeFile, makeNode } from './graphFixtures'
import { parseGraphFile } from './graphSchema'

describe('parseGraphFile', () => {
  it('accepts an empty graph', () => {
    expect(parseGraphFile(makeFile())).toEqual({ version: 1, nodes: [], edges: [] })
  })

  it('accepts the graph.json shipped in the repo', () => {
    expect(() => parseGraphFile(graphJson)).not.toThrow()
  })

  it('accepts a valid service node and defaults tags to []', () => {
    const { tags: _tags, ...withoutTags } = makeNode()
    const parsed = parseGraphFile(makeFile([withoutTags]))
    expect(parsed.nodes[0].tags).toEqual([])
    expect(parsed.nodes[0].id).toBe('nws-api')
  })

  it('accepts a MultiPolygon coverage', () => {
    const coverage = { type: 'MultiPolygon', coordinates: [[CONUS_RING], [CONUS_RING]] }
    expect(() => parseGraphFile(makeFile([makeNode({ coverage })]))).not.toThrow()
  })

  it('accepts a valid authored edge', () => {
    expect(() => parseGraphFile(makeFile([], [makeEdge()]))).not.toThrow()
  })

  it.each([
    ['a non-slug id', { id: 'NWS API' }],
    ['a reserved theme- id', { id: 'theme-weather' }],
    ['an unknown theme', { theme: 'volcanoes' }],
    ['a missing docUrl', { docUrl: undefined }],
    ['a malformed lastVerified date', { lastVerified: '09/21/2026' }],
    ['an unknown property', { colour: 'blue' }],
    ['an empty formats list', { formats: [] }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => parseGraphFile(makeFile([makeNode(overrides)]))).toThrow(/Invalid graph data/)
  })

  it('requires notLiveReason when liveLayer is false', () => {
    const bad = makeNode({ liveLayer: false })
    expect(() => parseGraphFile(makeFile([bad]))).toThrow(/notLiveReason/)
    const ok = makeNode({ liveLayer: false, notLiveReason: 'No CORS headers' })
    expect(() => parseGraphFile(makeFile([ok]))).not.toThrow()
  })

  describe('coverage geometry', () => {
    const withRing = (r: number[][]) => makeNode({ coverage: { type: 'Polygon', coordinates: [r] } })

    it('rejects out-of-range longitude and latitude', () => {
      expect(() => parseGraphFile(makeFile([withRing([[-181, 0], [0, 0], [0, 10], [-181, 0]])]))).toThrow()
      expect(() => parseGraphFile(makeFile([withRing([[0, -91], [10, 0], [0, 10], [0, -91]])]))).toThrow()
    })

    it('rejects a ring that is not closed', () => {
      expect(() => parseGraphFile(makeFile([withRing([[0, 0], [10, 0], [10, 10], [0, 10]])]))).toThrow(/closed/)
    })

    it('rejects a ring with fewer than 4 positions', () => {
      expect(() => parseGraphFile(makeFile([withRing([[0, 0], [10, 0], [0, 0]])]))).toThrow(/at least 4/)
    })

    it('rejects more than 3 decimal places', () => {
      expect(() => parseGraphFile(makeFile([withRing([[0.1234, 0], [10, 0], [10, 10], [0.1234, 0]])]))).toThrow(/decimal/)
    })

    it('accepts exactly 3 decimal places', () => {
      expect(() => parseGraphFile(makeFile([withRing([[0.123, 0], [10, 0], [10, 10], [0.123, 0]])]))).not.toThrow()
    })

    it('rejects unsupported geometry types', () => {
      const coverage = { type: 'Point', coordinates: [0, 0] }
      expect(() => parseGraphFile(makeFile([makeNode({ coverage })]))).toThrow()
    })
  })

  describe('authored edges', () => {
    it('rejects the derived theme edge type', () => {
      expect(() => parseGraphFile(makeFile([], [makeEdge({ type: 'theme' })]))).toThrow()
    })

    it('requires a sourceUrl', () => {
      expect(() => parseGraphFile(makeFile([], [makeEdge({ sourceUrl: undefined })]))).toThrow()
    })
  })

  it('rejects an unsupported version', () => {
    expect(() => parseGraphFile({ version: 2, nodes: [], edges: [] })).toThrow(/Invalid graph data/)
  })
})
