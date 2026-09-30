import { describe, expect, it } from 'vitest'
import {
  NOWCOAST_RADAR_ATTRIBUTION,
  NOWCOAST_RADAR_TILE_SIZE,
  NOWCOAST_RADAR_TILE_URL,
} from './nowcoastRadarLayer'

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
  })

  it('credits NOAA and nowCOAST', () => {
    expect(NOWCOAST_RADAR_ATTRIBUTION).toContain('nowCOAST')
    expect(NOWCOAST_RADAR_ATTRIBUTION).toContain('NOAA')
  })
})
