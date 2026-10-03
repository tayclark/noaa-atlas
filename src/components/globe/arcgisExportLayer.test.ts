import { describe, expect, it } from 'vitest'
import { ArcgisHttpError, ArcgisParseError } from '../../data/arcgisClient'
import { makeArcgisHabitatLegend, makeArcgisLegend } from '../../data/arcgisFixtures'
import {
  ARCGIS_OVERLAYS,
  ARCGIS_TILE_SIZE,
  arcgisExportTileUrl,
  arcgisLegendSections,
  arcgisOverlaysFor,
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

  it('draws the charts from the ENC chart service, which has no legend (#309)', () => {
    expect(ARCGIS_OVERLAYS.filter((o) => o.hasLegend === false).map((o) => o.key)).toEqual(['arcgis-charts'])
    const charts = ARCGIS_OVERLAYS.find((o) => o.key === 'arcgis-charts')
    const url = charts ? arcgisExportTileUrl(charts.serviceUrl, charts.layerIdsInService) : ''
    expect(url).toContain('/exts/MaritimeChartService/MapServer/export?')
    expect(url).toContain('layers=show:0,1,2,3,4,5,6,7')
  })
})

describe('arcgisOverlaysFor (#288)', () => {
  it('returns nothing when no overlay is lit, and ignores other live layers', () => {
    expect(arcgisOverlaysFor([])).toEqual([])
    expect(arcgisOverlaysFor(['nws-alerts', 'spc-outlook'])).toEqual([])
  })

  it('returns every lit overlay in drawing order, charts first', () => {
    expect(arcgisOverlaysFor(['arcgis-raster', 'nws-alerts']).map((o) => o.key)).toEqual(['arcgis-raster'])
    expect(arcgisOverlaysFor(['arcgis-raster', 'arcgis-charts']).map((o) => o.key)).toEqual(['arcgis-charts', 'arcgis-raster'])
  })
})

describe('arcgisLegendSections (#288)', () => {
  const overlay = (key: string) => {
    const found = ARCGIS_OVERLAYS.find((o) => o.key === key)
    if (!found) throw new Error(`no overlay "${key}"`)
    return found
  }
  const [raster, vector, charts, habitat] = ['arcgis-raster', 'arcgis-vector', 'arcgis-charts', 'arcgis-habitat'].map(overlay)
  const entry = { label: '1 to 2', contentType: 'image/png', imageData: 'AAAA' }

  it('lists nothing while a legend loads or when it has no labelled entries', () => {
    expect(arcgisLegendSections([raster], {})).toEqual([])
    expect(arcgisLegendSections([raster], { 'arcgis-raster': { status: 'loading' } })).toEqual([])
    expect(arcgisLegendSections([habitat], { 'arcgis-habitat': { status: 'ok', entries: [] } })).toEqual([])
    // The charts have no legend to fetch, so they never get a state (#309).
    expect(arcgisLegendSections([charts], {})).toEqual([])
  })

  it('gives a failed legend its message', () => {
    expect(arcgisLegendSections([raster], { 'arcgis-raster': { status: 'error', message: 'down' } })).toEqual([
      { key: 'arcgis-raster', title: raster.title, message: 'down' },
    ])
  })

  it('lists one section per overlay with something to say, in the given order', () => {
    const sections = arcgisLegendSections([charts, raster, vector], {
      'arcgis-raster': { status: 'ok', entries: [entry] },
      'arcgis-vector': { status: 'error', message: 'down' },
    })
    expect(sections).toEqual([
      { key: 'arcgis-raster', title: raster.title, entries: [entry] },
      { key: 'arcgis-vector', title: vector.title, message: 'down' },
    ])
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

})

describe('describeArcgisFetchOutcome', () => {
  it('names the failure kind', () => {
    expect(describeArcgisFetchOutcome(new ArcgisHttpError(503))).toContain('unavailable')
    expect(describeArcgisFetchOutcome(new ArcgisParseError('bad', null))).toContain('unexpected')
    expect(describeArcgisFetchOutcome(new TypeError('Failed to fetch'))).toContain('Could not reach')
    expect(describeArcgisFetchOutcome(new Error('x'))).toContain('Something went wrong')
  })
})
