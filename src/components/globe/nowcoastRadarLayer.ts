// The nowCOAST radar overlay (#56): a WMS base-reflectivity mosaic that MapLibre requests as
// raster tiles. It has no client, schema or request-log entry because MapLibre owns the fetches,
// and it is drawn only while the nowCOAST node is selected, so nothing is requested on page load.
// The WMS `time` dimension defaults to the latest frame, so the base URL deliberately omits it;
// `radarTileUrl` adds it while the time slider (#74) is on an earlier frame.

export const NOWCOAST_RADAR_TILE_SIZE = 256
export const NOWCOAST_RADAR_OPACITY = 0.7

// `{bbox-epsg-3857}` is MapLibre's placeholder for each tile's Web Mercator bounding box.
export const NOWCOAST_RADAR_TILE_URL =
  'https://nowcoast.noaa.gov/geoserver/weather_radar/wms?service=WMS&version=1.3.0&request=GetMap' +
  '&layers=base_reflectivity_mosaic&styles=&format=image/png&transparent=true&crs=EPSG:3857' +
  `&width=${NOWCOAST_RADAR_TILE_SIZE}&height=${NOWCOAST_RADAR_TILE_SIZE}&bbox={bbox-epsg-3857}`

/** The tile URL for one frame, or for the latest frame when `time` is null. */
export function radarTileUrl(time: string | null): string {
  return time ? `${NOWCOAST_RADAR_TILE_URL}&time=${encodeURIComponent(time)}` : NOWCOAST_RADAR_TILE_URL
}

export const NOWCOAST_RADAR_ATTRIBUTION =
  'Radar: <a href="https://nowcoast.noaa.gov/">NOAA/NWS via nowCOAST</a>'
