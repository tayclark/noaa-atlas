// Cross-origin mock responses. The app calls the NOAA hosts from the browser, so a fulfilled route
// needs the CORS header the real API sends, or the page sees a network error instead of the body.

export const CORS_HEADERS = { 'access-control-allow-origin': '*' }

/** A `route.fulfill` option set for a JSON body, with the CORS header. */
export function corsJson(body: unknown, { status = 200, contentType = 'application/json' }: { status?: number; contentType?: string } = {}) {
  return { status, contentType, headers: CORS_HEADERS, body: JSON.stringify(body) }
}
