// The radar's time dimension (#74). nowCOAST publishes the available frames in GetCapabilities as
// one comma-separated ISO list on the CONUS mosaic layer (about 4 minutes apart, roughly 6 hours
// back). The `base_reflectivity_mosaic` group the globe draws has no dimension of its own, but it
// honours `time` and snaps to the nearest frame of each regional mosaic.

export const NOWCOAST_CAPABILITIES_URL =
  'https://nowcoast.noaa.gov/geoserver/weather_radar/wms?service=WMS&version=1.3.0&request=GetCapabilities'

const FRAME_LAYER = 'conus_base_reflectivity_mosaic'
const TIME_DIMENSION = /<Dimension\b[^>]*\bname="time"[^>]*>([^<]*)<\/Dimension>/

/** The frame timestamps (ISO, oldest first) of the CONUS mosaic, or [] if the document has none. */
export function parseRadarFrames(capabilitiesXml: string): string[] {
  return parseWmsTimeFrames(capabilitiesXml, FRAME_LAYER)
}

/** The `time` dimension (ISO, oldest first) of one layer in a WMS GetCapabilities document, or []. */
export function parseWmsTimeFrames(capabilitiesXml: string, layer: string): string[] {
  const start = capabilitiesXml.indexOf(`<Name>${layer}</Name>`)
  if (start === -1) return []
  // Stop at the next layer's name so a layer without a dimension can't borrow its neighbour's.
  const next = capabilitiesXml.indexOf('<Name>', start + 1)
  const block = capabilitiesXml.slice(start, next === -1 ? undefined : next)
  const list = TIME_DIMENSION.exec(block)?.[1]
  if (!list) return []
  return list
    .split(',')
    .map((t) => t.trim())
    .filter((t) => !Number.isNaN(Date.parse(t)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
}

/** "Latest", "24 min earlier" or "1 h 4 min earlier", relative to the newest frame. */
export function formatFrameOffset(frame: string, latest: string): string {
  const minutes = Math.round((Date.parse(latest) - Date.parse(frame)) / 60_000)
  if (minutes <= 0) return 'Latest'
  if (minutes < 60) return `${minutes} min earlier`
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''} earlier`
}

/**
 * The frame to show for the shared time (#228): null follows the latest frame, as does any time at
 * or after it; an earlier time snaps to the nearest frame (the oldest, when before them all).
 */
export function frameForTime(frames: string[], time: number | null): string | null {
  if (time === null || frames.length === 0) return null
  if (time >= Date.parse(frames[frames.length - 1])) return null
  let best = frames[0]
  for (const frame of frames) {
    if (Math.abs(Date.parse(frame) - time) < Math.abs(Date.parse(best) - time)) best = frame
  }
  return best
}
