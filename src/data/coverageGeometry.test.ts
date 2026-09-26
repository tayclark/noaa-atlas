import { describe, expect, it } from 'vitest'
import {
  PRESETS,
  bboxPolygon,
  boxesGeometry,
  byteSize,
  closeRing,
  extractPolygons,
  fitGeometry,
  presetGeometry,
  presetSources,
  processGeometry,
  roundPosition,
  selectPolygons,
  simplifyRing,
  sphericalCap,
  type SourceGeometry,
} from './coverageGeometry'
import { isPointInCoverage } from './coverageLookup'
import { coverageSchema, type Coverage } from './graphSchema'

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
  it('bisects back from the first fitting tolerance, so the output is close to the target', () => {
    // A regular circle simplifies in steps; a wobbly coastline-like ring shrinks gradually.
    const wobbly = circle(-100, 40, 20, 2000).map(([x, y], i) => [x + Math.sin(i * 0.37) * 0.8, y + Math.sin(i * 0.11) * 0.6])
    const coast: SourceGeometry = { type: 'Polygon', coordinates: [closeRing(wobbly.slice(0, -1))] }
    const fit = fitGeometry(coast, 2000)
    const doubled = 0.005 * 2 ** Math.ceil(Math.log2(fit.tolerance / 0.005))
    expect(fit.bytes).toBeLessThanOrEqual(2000)
    expect(fit.bytes).toBeGreaterThan(byteSize(processGeometry(coast, doubled)))
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

const asCoverage = (geometry: SourceGeometry) => geometry as Coverage
const rings = (west: number, south: number, east: number, north: number) => bboxPolygon([west, south, east, north])
const feature = (properties: Record<string, unknown>, coordinates: number[][][]) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Polygon', coordinates },
})
const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features })

describe('sphericalCap', () => {
  it('holds points within the radius and none beyond it', () => {
    const cap = asCoverage(sphericalCap({ lon: -75, lat: 0, radius: 30 }))
    expect(isPointInCoverage(cap, [-75, 0])).toBe(true)
    expect(isPointInCoverage(cap, [-75, 29])).toBe(true)
    expect(isPointInCoverage(cap, [-75, 31])).toBe(false)
    expect(isPointInCoverage(cap, [-104, 0])).toBe(true)
    expect(isPointInCoverage(cap, [-106, 0])).toBe(false)
  })

  it('splits a cap that crosses the antimeridian, keeping every longitude in range', () => {
    const cap = sphericalCap({ lon: -170, lat: 0, radius: 30 })
    expect(cap.coordinates).toHaveLength(2)
    const polygons = cap.type === 'MultiPolygon' ? cap.coordinates : [cap.coordinates]
    const lons = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring.map((position) => position[0] as number)))
    expect(Math.min(...lons)).toBeGreaterThanOrEqual(-180)
    expect(Math.max(...lons)).toBeLessThanOrEqual(180)
    expect(isPointInCoverage(asCoverage(cap), [170, 0])).toBe(true) // 20° west of the centre, over the dateline
    expect(isPointInCoverage(asCoverage(cap), [150, 0])).toBe(false)
  })

  it('refuses a cap that reaches a pole', () => {
    expect(() => sphericalCap({ lon: 0, lat: 70, radius: 30 })).toThrow(/pole/)
  })
})

describe('presetGeometry', () => {
  const countries = collection(
    feature({ ADM0_A3: 'AAA' }, rings(0, 0, 10, 10)),
    feature({ ADM0_A3: 'BBB' }, rings(20, 0, 30, 10)),
  )
  const eez = collection(feature({ mrgid: 1 }, rings(10, 0, 15, 10)), feature({ mrgid: 2 }, rings(40, 0, 50, 10)))
  const lakes = collection(feature({ name: 'Lake X' }, rings(5, 2, 25, 4)))

  it('merges a country with its EEZ into one outline', () => {
    const merged = presetGeometry({ description: '', countries: ['AAA'], eez: [1] }, { countries, eez })
    expect(merged.coordinates).toHaveLength(1)
    expect(isPointInCoverage(asCoverage(merged), [12, 5])).toBe(true)
    expect(isPointInCoverage(asCoverage(merged), [25, 5])).toBe(false)
  })

  it('cuts the named countries out of water-only coverage', () => {
    const water = asCoverage(presetGeometry({ description: '', eez: [1], subtract: ['AAA'] }, { countries, eez: collection(feature({ mrgid: 1 }, rings(5, 0, 15, 10))) }))
    expect(isPointInCoverage(water, [12, 5])).toBe(true)
    expect(isPointInCoverage(water, [7, 5])).toBe(false) // on AAA's land
  })

  it('cuts lakes to the part inside the named country', () => {
    const cut = asCoverage(presetGeometry({ description: '', lakes: { names: ['Lake X'], within: 'AAA' } }, { countries, lakes }))
    expect(isPointInCoverage(cut, [7, 3])).toBe(true)
    expect(isPointInCoverage(cut, [22, 3])).toBe(false) // in the lake, but inside BBB
  })

  it('clips to a rectangle', () => {
    const clipped = asCoverage(presetGeometry({ description: '', eez: [1, 2], clip: [0, 0, 20, 5] }, { eez }))
    expect(isPointInCoverage(clipped, [12, 2])).toBe(true)
    expect(isPointInCoverage(clipped, [12, 8])).toBe(false)
    expect(isPointInCoverage(clipped, [45, 2])).toBe(false)
  })

  it('adds ocean basins by name, each cut to its own rectangle', () => {
    const oceans = collection(feature({ name: 'East' }, rings(0, 0, 10, 10)), feature({ name: 'West' }, rings(-20, 0, -10, 10)))
    const basins = asCoverage(presetGeometry({ description: '', oceans: [{ name: 'East' }, { name: 'West', clip: [-20, 0, -15, 10] }] }, { oceans }))
    expect(isPointInCoverage(basins, [5, 5])).toBe(true)
    expect(isPointInCoverage(basins, [-17, 5])).toBe(true)
    expect(isPointInCoverage(basins, [-12, 5])).toBe(false) // in West, outside its clip
    expect(() => presetGeometry({ description: '', oceans: [{ name: 'Nowhere' }] }, { oceans })).toThrow(/\(name\): Nowhere/)
  })

  it('passes a single part through unchanged', () => {
    expect(presetGeometry(PRESETS.worldwide!)).toEqual(boxesGeometry(PRESETS.worldwide!.boxes!))
  })

  it('names what is missing from the source data', () => {
    expect(() => presetGeometry({ description: '', countries: ['ZZZ'] }, { countries })).toThrow(/ADM0_A3\): ZZZ/)
  })

  it('lists only the sources a preset needs', () => {
    expect(presetSources(PRESETS['goes-east-west']!)).toEqual([])
    expect(presetSources(PRESETS['us-waters']!)).toEqual(['countries', 'eez', 'lakes'])
    expect(presetSources(PRESETS['us-land-and-waters']!)).toEqual(['countries', 'eez'])
    expect(presetSources(PRESETS['northeast-us-shelf']!)).toEqual(['countries', 'eez'])
    expect(presetSources(PRESETS['nhc-basins']!)).toEqual(['oceans'])
  })

  it('builds the GOES-East and GOES-West view without downloads, within the size target', () => {
    const coverage = fitGeometry(presetGeometry(PRESETS['goes-east-west']!), 4096)
    expect(coverage.withinTarget).toBe(true)
    expect(isPointInCoverage(coverage.coverage, [-100, 40])).toBe(true)
    expect(isPointInCoverage(coverage.coverage, [10, 50])).toBe(false)
  })
})
