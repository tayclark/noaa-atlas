import { describe, expect, it } from 'vitest'
import {
  PRESETS,
  bboxPolygon,
  boxesGeometry,
  byteSize,
  closeRing,
  extractPolygons,
  fitGeometry,
  processGeometry,
  roundPosition,
  selectPolygons,
  simplifyRing,
  type SourceGeometry,
} from './coverageGeometry'
import { coverageSchema } from './graphSchema'

/** A circle-ish ring with many vertices, closed. */
function circle(cx: number, cy: number, r: number, n = 200): number[][] {
  const ring = Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)])
  return closeRing(ring)
}

describe('roundPosition', () => {
  it('rounds to 3 decimals and clamps to WGS84 ranges', () => {
    expect(roundPosition([-100.123456, 40.98765])).toEqual([-100.123, 40.988])
    expect(roundPosition([181.5, -91])).toEqual([180, -90])
  })
})

describe('closeRing', () => {
  it('appends the first position when the ring is open', () => {
    expect(closeRing([[0, 0], [1, 0], [1, 1]])).toEqual([[0, 0], [1, 0], [1, 1], [0, 0]])
  })
  it('leaves a closed ring and an empty ring alone', () => {
    const closed = [[0, 0], [1, 0], [1, 1], [0, 0]]
    expect(closeRing(closed)).toBe(closed)
    expect(closeRing([])).toEqual([])
  })
})

describe('simplifyRing', () => {
  it('reduces vertices, rounds and returns a closed ring', () => {
    const ring = simplifyRing(circle(-100.123456, 40.654321, 5), 0.1)!
    expect(ring.length).toBeLessThan(100)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(ring.flat().every((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6)).toBe(true)
  })
  it('accepts an open input ring', () => {
    const ring = simplifyRing([[0, 0], [4, 0], [4, 4], [0, 4]], 0.01)!
    expect(ring).toEqual([[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]])
  })
  it('returns null for degenerate rings', () => {
    expect(simplifyRing([[0, 0], [1, 1]], 0.1)).toBeNull()
    expect(simplifyRing([[0, 0], [0.0001, 0.0001], [0.0002, 0], [0, 0]], 1)).toBeNull()
  })
  it('collapses consecutive duplicates created by rounding', () => {
    const ring = simplifyRing([[0, 0], [0.0001, 0.0001], [2, 0], [2, 2], [0, 2], [0, 0]], 0)!
    expect(ring).toEqual([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]])
  })
  it('handles a zero-length chord (repeated split point)', () => {
    expect(simplifyRing([[0, 0], [1, 0], [1, 1], [0, 0], [0, 1]], 0.5)).not.toBeNull()
  })
})

describe('processGeometry', () => {
  it('produces schema-valid Polygon output and keeps holes', () => {
    const geometry: SourceGeometry = { type: 'Polygon', coordinates: [circle(0, 0, 10), circle(0, 0, 2)] }
    const coverage = processGeometry(geometry, 0.05)
    expect(coverageSchema.safeParse(coverage).success).toBe(true)
    expect(coverage.type).toBe('Polygon')
    expect(coverage.coordinates).toHaveLength(2)
  })
  it('drops degenerate holes and polygons, and unwraps a single remaining polygon', () => {
    const tiny = [[0, 0], [0.0001, 0], [0.0001, 0.0001], [0, 0]]
    const coverage = processGeometry({ type: 'MultiPolygon', coordinates: [[circle(0, 0, 5), tiny], [tiny]] }, 0.5)
    expect(coverage.type).toBe('Polygon')
    expect(coverage.coordinates).toHaveLength(1)
  })
  it('keeps a MultiPolygon when several polygons survive', () => {
    const coverage = processGeometry({ type: 'MultiPolygon', coordinates: [[circle(0, 0, 5)], [circle(20, 20, 5)]] }, 0.1)
    expect(coverage.type).toBe('MultiPolygon')
  })
  it('throws when nothing survives', () => {
    expect(() => processGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }, 0.1)).toThrow(/No polygons left/)
  })
})

describe('fitGeometry', () => {
  const geometry: SourceGeometry = { type: 'Polygon', coordinates: [circle(-100, 40, 20, 2000)] }
  it('raises the tolerance until the output fits the byte target', () => {
    const fit = fitGeometry(geometry, 800)
    expect(fit.withinTarget).toBe(true)
    expect(fit.bytes).toBeLessThanOrEqual(800)
    expect(fit.bytes).toBe(byteSize(fit.coverage))
    expect(fit.tolerance).toBeGreaterThan(0.005)
  })
  it('reports when the target cannot be met', () => {
    expect(fitGeometry(geometry, 10).withinTarget).toBe(false)
  })
  it('returns the last valid geometry when a larger tolerance collapses it', () => {
    const small: SourceGeometry = { type: 'Polygon', coordinates: [circle(0, 0, 0.01, 50)] }
    expect(fitGeometry(small, 10, 0.001).coverage).toBeDefined()
  })
  it('throws when even the starting tolerance yields nothing', () => {
    expect(() => fitGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }, 100)).toThrow(/No polygons left/)
  })
})

describe('selectPolygons / extractPolygons', () => {
  const a = [circle(-100, 40, 1, 8)]
  const b = [circle(-150, 65, 1, 8)]
  it('keeps polygons whose bbox centre is inside a selection box', () => {
    const selected = selectPolygons({ type: 'MultiPolygon', coordinates: [a, b] }, [[-125, 24, -66, 50]])
    expect(selected.coordinates).toHaveLength(1)
  })
  it('accepts a single Polygon and throws when nothing matches', () => {
    expect(selectPolygons({ type: 'Polygon', coordinates: a }, [[-125, 24, -66, 50]]).coordinates).toHaveLength(1)
    expect(() => selectPolygons({ type: 'Polygon', coordinates: a }, [[0, 0, 1, 1]])).toThrow(/No polygons matched/)
  })
  it('merges polygons from geometries, features, collections and geometry collections', () => {
    const polygon = { type: 'Polygon', coordinates: a }
    const multi = { type: 'MultiPolygon', coordinates: [a, b] }
    const collection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: polygon }, { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [multi, { type: 'Point', coordinates: [0, 0] }] } }],
    }
    expect(extractPolygons(collection).coordinates).toHaveLength(3)
  })
  it('throws when there is no polygon geometry', () => {
    expect(() => extractPolygons({ type: 'Point', coordinates: [0, 0] })).toThrow(/no Polygon or MultiPolygon/)
    expect(() => extractPolygons(null)).toThrow(/no Polygon or MultiPolygon/)
  })
})

describe('presets', () => {
  it('every hand-defined preset produces schema-valid, small coverage', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      if (!preset.boxes) continue
      const coverage = processGeometry(boxesGeometry(preset.boxes), 0.005)
      expect(coverageSchema.safeParse(coverage).success, name).toBe(true)
      expect(byteSize(coverage), name).toBeLessThan(1000)
    }
  })
  it('worldwide is the full-world polygon', () => {
    const coverage = processGeometry(boxesGeometry(PRESETS.worldwide.boxes!), 0.005)
    expect(coverage).toEqual({ type: 'Polygon', coordinates: bboxPolygon([-180, -90, 180, 90]) })
  })
})
