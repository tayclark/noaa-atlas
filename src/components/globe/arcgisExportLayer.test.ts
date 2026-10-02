import { describe, expect, it } from 'vitest'
import { ArcgisHttpError, ArcgisParseError } from '../../data/arcgisClient'
import { makeArcgisChartsLegend, makeArcgisHabitatLegend, makeArcgisLegend } from '../../data/arcgisFixtures'
import {
  ARCGIS_OVERLAYS,
  ARCGIS_TILE_SIZE,
  arcgisExportTileUrl,
  describeArcgisFetchOutcome,
  legendEntriesFor,
} from './arcgisExportLayer'
import { LIVE_LAYERS } from './liveLayers'

describe('arcgisExportTileUrl', () => {
  const url = arcgisExportTileUrl('https://example.test/rest/services/x/MapServer', [28])

  it('asks the export endpoint for a transparent PNG in Web Mercator', () => {
    const parsed = new URL(url.replace('{bbox-epsg-3857}', '0,0,1,1'))
    expect(parsed.pathname).toBe('/rest/services/x/MapServer/export')
    expect(parsed.searchParams.get('f')).toBe('image')
    expect(parsed.searchParams.get('transparent')).toBe('true')
    expect(parsed.searchParams.get('format')).toBe('png32')
    expect(parsed.searchParams.get('bboxSR')).toBe('3857')
    expect(parsed.searchParams.get('imageSR')).toBe('3857')
  })

  it('shows several sublayers as a comma-separated list', () => {
    expect(arcgisExportTileUrl('https://example.test/MapServer', [226, 2])).toContain('layers=show:226,2')
  })

  it("keeps MapLibre's bbox placeholder, sizes the tile and shows one sublayer", () => {
    expect(url).toContain('bbox={bbox-epsg-3857}')
    expect(url).toContain(`size=${ARCGIS_TILE_SIZE},${ARCGIS_TILE_SIZE}`)
    expect(url).toContain('layers=show:28')
  })
})

describe('ARCGIS_OVERLAYS', () => {
  it('has one overlay per arcgis live layer, each with its own source and layer ids', () => {
    const keys = Object.values(LIVE_LAYERS).flatMap((l) => (l.layer?.startsWith('arcgis-') ? [l.layer] : []))
    expect(ARCGIS_OVERLAYS.map((o) => o.key).sort()).toEqual([...keys].sort())
    expect(new Set(ARCGIS_OVERLAYS.map((o) => o.sourceId)).size).toBe(ARCGIS_OVERLAYS.length)
    expect(new Set(ARCGIS_OVERLAYS.map((o) => o.layerId)).size).toBe(ARCGIS_OVERLAYS.length)
  })
})

describe('legendEntriesFor', () => {
  it('returns the image entries of the drawn sublayer only', () => {
    expect(legendEntriesFor(makeArcgisLegend(), [28]).map((e) => e.label)).toEqual([
      'Greater than or equal to 10',
      '0.1  to  0.25',
      'Missing data',
    ])
  })

  it('is empty when the service does not describe the sublayer', () => {
    expect(legendEntriesFor(makeArcgisLegend(), [99])).toEqual([])
  })

  it('drops unlabeled swatches, as in the critical habitat legend', () => {
    expect(legendEntriesFor(makeArcgisHabitatLegend(), [226, 2])).toEqual([])
  })

  it('returns no entries for the chart service, whose legend is empty', () => {
    expect(legendEntriesFor(makeArcgisChartsLegend(), [0])).toEqual([])
  })
})

describe('describeArcgisFetchOutcome', () => {
  it('names the failure kind', () => {
    expect(describeArcgisFetchOutcome(new ArcgisHttpError(503))).toContain('unavailable')
    expect(describeArcgisFetchOutcome(new ArcgisParseError('bad', null))).toContain('unexpected')
    expect(describeArcgisFetchOutcome(new TypeError('Failed to fetch'))).toContain('Could not reach')
    expect(describeArcgisFetchOutcome(new Error('x'))).toContain('Something went wrong')
  })
})
