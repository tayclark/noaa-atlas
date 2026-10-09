// GOES satellite imagery under the hurricane tracks (#338): nowCOAST's GOES East and West longwave
// infrared mosaic, which MapLibre requests as WMS raster tiles, like the radar (nowcoastRadarLayer.ts).
// nowCOAST keeps about 8 hours of 5-minute frames, so the image follows the storm slider inside
// that window and shows the latest frame outside it (older history, or the forecast).

import { parseWmsTimeFrames } from './radarTimes'

export const GOES_TILE_SIZE = 256
export const GOES_OPACITY = 0.85
const GOES_LAYER = 'goes_longwave_imagery'

export const GOES_CAPABILITIES_URL =
  'https://nowcoast.noaa.gov/geoserver/satellite/wms?service=WMS&version=1.3.0&request=GetCapabilities'

// `{bbox-epsg-3857}` is MapLibre's placeholder for each tile's Web Mercator bounding box.
export const GOES_TILE_URL =
  'https://nowcoast.noaa.gov/geoserver/satellite/wms?service=WMS&version=1.3.0&request=GetMap' +
  `&layers=${GOES_LAYER}&styles=&format=image/png&transparent=true&crs=EPSG:3857` +
  `&width=${GOES_TILE_SIZE}&height=${GOES_TILE_SIZE}&bbox={bbox-epsg-3857}`

export const GOES_ATTRIBUTION = 'Satellite: <a href="https://nowcoast.noaa.gov/">NOAA/NESDIS GOES via nowCOAST</a>'

/** How often the frame list is re-read while the imagery is shown; a new frame lands every 5 minutes. */
export const GOES_FRAMES_REFRESH_MS = 5 * 60_000

/** A slider time this far outside the archive still uses its nearest frame rather than the latest. */
const EDGE_MS = 10 * 60_000

/** The GOES longwave frame times (ISO, oldest first) in nowCOAST's satellite GetCapabilities, or []. */
export function parseGoesFrames(capabilitiesXml: string): string[] {
  return parseWmsTimeFrames(capabilitiesXml, GOES_LAYER)
}

/**
 * The frame to draw for a storm slider time: the nearest archived frame while the time is inside the
 * archive, else null for the latest image (a storm's older history, or its forecast).
 */
export function goesFrameForTime(frames: readonly string[], time: number | null): string | null {
  if (time === null || frames.length === 0) return null
  const first = Date.parse(frames[0] as string)
  const last = Date.parse(frames[frames.length - 1] as string)
  if (time < first - EDGE_MS || time >= last) return null
  let best = frames[0] as string
  for (const frame of frames) {
    if (Math.abs(Date.parse(frame) - time) < Math.abs(Date.parse(best) - time)) best = frame
  }
  return best
}

/** The tile URL for one frame, or for the latest frame when `time` is null. */
export function goesTileUrl(time: string | null): string {
  return time ? `${GOES_TILE_URL}&time=${encodeURIComponent(time)}` : GOES_TILE_URL
}

/**
 * The readout's note on which image is drawn: "satellite 14:05 UTC" when it matches the slider,
 * "satellite latest, 20:25 UTC" when the slider is outside the archive. Null before the list loads.
 */
export function describeGoesFrame(frames: readonly string[], frame: string | null): string | null {
  const shown = frame ?? frames[frames.length - 1]
  if (!shown) return null
  const clock = new Date(shown).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })
  return frame ? `satellite ${clock} UTC` : `satellite latest, ${clock} UTC`
}
