// nowCOAST radar mocks for e2e (#56). MapLibre requests the WMS tiles itself, so the mock is a
// route on the tile URL that answers every tile with a 1x1 transparent PNG.
// GetCapabilities on the same path gets a small frame list for the time slider (#74).

import type { Page } from '@playwright/test'

export const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export const RADAR_TILES = '**/geoserver/weather_radar/wms**'

// Three frames, ten minutes apart, in the shape of nowCOAST's GetCapabilities (#74).
export const RADAR_FRAMES = ['2026-10-01T02:40:00.000Z', '2026-10-01T02:50:00.000Z', '2026-10-01T03:00:00.000Z']

const CAPABILITIES_XML = `<WMS_Capabilities><Capability><Layer><Name>base_reflectivity_mosaic</Name>
<Layer><Name>conus_base_reflectivity_mosaic</Name>
<Dimension name="time" default="${RADAR_FRAMES[2]}" units="ISO8601" nearestValue="1">${RADAR_FRAMES.join(',')}</Dimension>
</Layer></Layer></Capability></WMS_Capabilities>`

/**
 * Serves transparent tiles and the frame list. Returns the GetMap URLs that the page requested,
 * for asserting on; pass `{ capabilities: false }` to make the frame list fail.
 */
export async function mockRadar(page: Page, { capabilities = true } = {}) {
  const requests: string[] = []
  await page.route(RADAR_TILES, (route) => {
    const url = route.request().url()
    const headers = { 'access-control-allow-origin': '*' }
    if (url.includes('request=GetCapabilities')) {
      return capabilities
        ? route.fulfill({ contentType: 'text/xml', body: CAPABILITIES_XML, headers })
        : route.fulfill({ status: 503, headers })
    }
    requests.push(url)
    return route.fulfill({ contentType: 'image/png', body: TRANSPARENT_PNG, headers })
  })
  return requests
}
