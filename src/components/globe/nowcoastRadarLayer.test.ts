import { describe, expect, it } from 'vitest'
import {
  NOWCOAST_RADAR_ATTRIBUTION,
  NOWCOAST_RADAR_TILE_SIZE,
  NOWCOAST_RADAR_TILE_URL,
  radarLayers,
  radarTileUrl,
} from './nowcoastRadarLayer'
import type { LayerGroup } from './mapLayers'

describe('nowCOAST radar tile URL', () => {
  const url = new URL(NOWCOAST_RADAR_TILE_URL.replace('{bbox-epsg-3857}', '0,0,1,1'))

  it('requests the base reflectivity mosaic as a transparent PNG in Web Mercator', () => {
    expect(url.origin + url.pathname).toBe('https://nowcoast.noaa.gov/geoserver/weather_radar/wms')
    expect(url.searchParams.get('request')).toBe('GetMap')
    expect(url.searchParams.get('layers')).toBe('base_reflectivity_mosaic')
    expect(url.searchParams.get('crs')).toBe('EPSG:3857')
    expect(url.searchParams.get('format')).toBe('image/png')
    expect(url.searchParams.get('transparent')).toBe('true')
  })

  it("asks for tiles of the source's size and lets MapLibre fill the bbox", () => {
    expect(url.searchParams.get('width')).toBe(String(NOWCOAST_RADAR_TILE_SIZE))
    expect(url.searchParams.get('height')).toBe(String(NOWCOAST_RADAR_TILE_SIZE))
    expect(NOWCOAST_RADAR_TILE_URL).toContain('bbox={bbox-epsg-3857}')
  })

  it('leaves out the time dimension so the server returns the latest frame', () => {
    expect(url.searchParams.has('time')).toBe(false)
    expect(radarTileUrl(null)).toBe(NOWCOAST_RADAR_TILE_URL)
  })

  it('adds the frame time, keeping the bbox placeholder for MapLibre', () => {
    const framed = radarTileUrl('2026-09-30T21:04:07.000Z')
    expect(new URL(framed.replace('{bbox-epsg-3857}', '0,0,1,1')).searchParams.get('time')).toBe('2026-09-30T21:04:07.000Z')
    expect(framed).toContain('bbox={bbox-epsg-3857}')
  })

  it('credits NOAA and nowCOAST', () => {
    expect(NOWCOAST_RADAR_ATTRIBUTION).toContain('nowCOAST')
    expect(NOWCOAST_RADAR_ATTRIBUTION).toContain('NOAA')
  })
})

const layerIds = (group: LayerGroup) => group.layers.map((layer) => layer.id)
const visibility = (group: LayerGroup) => group.layers.map((layer) => ('layout' in layer ? layer.layout?.visibility : undefined))
const sources = (group: LayerGroup) => new Set(group.layers.map((layer) => ('source' in layer ? layer.source : undefined)))

describe('radarLayers', () => {
  it('is a credited raster of the latest frame, hidden until selected', () => {
    const group = radarLayers()
    expect(group.source).toMatchObject({ type: 'raster', tiles: [NOWCOAST_RADAR_TILE_URL], tileSize: 256, attribution: NOWCOAST_RADAR_ATTRIBUTION })
    expect(layerIds(group)).toEqual(['nowcoast-radar-raster'])
    expect(sources(group)).toEqual(new Set([group.sourceId]))
    expect(visibility(group)).toEqual(['none'])
  })
})
