// Typed wrapper around the ArcGIS MapServer legend call behind the globe overlays (#247; see the
// nws-raster-map-services node in graph.json). MapLibre fetches the overlay's export images itself,
// so only this JSON call reaches the Inspector. The hosts echo the request Origin, so no special
// headers are needed.

import { makeClientErrors, type ClientHttpError, type ClientParseError } from './clientErrors'
import { createLiveClient } from './liveRequest'
import { parseArcgisLegend, type ArcgisLegend } from './arcgisSchema'

export const arcgisErrors = makeClientErrors('ArcGIS', 'Arcgis')
export const ArcgisHttpError = arcgisErrors.HttpError
export type ArcgisHttpError = ClientHttpError
export const ArcgisParseError = arcgisErrors.ParseError
export type ArcgisParseError = ClientParseError

// One client per host, so the Inspector shows a short path (/raster/rest/services/...) like the other clients.
const clients = new Map<string, ReturnType<typeof createLiveClient>>()

function clientFor(origin: string) {
  let client = clients.get(origin)
  if (!client) {
    client = createLiveClient({
      baseUrl: origin,
      headers: {},
      httpError: arcgisErrors.httpError,
      parseError: arcgisErrors.parseError,
    })
    clients.set(origin, client)
  }
  return client
}

/** Clears the in-memory response caches. Intended for test isolation between cases. */
export function clearArcgisCache(): void {
  for (const client of clients.values()) client.clearCache()
}

/** The legend of every layer in a MapServer, given its URL (no trailing slash). */
export function getArcgisLegend(serviceUrl: string): Promise<ArcgisLegend> {
  const { origin, pathname } = new URL(serviceUrl)
  return clientFor(origin).request(`${pathname}/legend?f=json`, parseArcgisLegend)
}
