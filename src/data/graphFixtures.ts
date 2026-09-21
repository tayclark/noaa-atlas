// Small plain-object fixtures used by the graph tests. Kept as untyped data on purpose,
// so tests can break individual fields and assert that validation rejects them.

export const CONUS_RING = [
  [-125, 32],
  [-125, 49],
  [-67, 49],
  [-67, 25],
  [-125, 32],
]

export function makeNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'nws-api',
    kind: 'service',
    name: 'NWS API',
    summary: 'Forecasts, alerts and observations for the United States.',
    owner: { office: 'NWS', program: 'api.weather.gov' },
    theme: 'weather',
    baseUrl: 'https://api.weather.gov',
    formats: ['json', 'geojson'],
    auth: { type: 'none', note: 'User-Agent header required' },
    rateLimits: { text: 'Not published; requests may be blocked with 403 when abused.' },
    coverage: { type: 'Polygon', coordinates: [CONUS_RING] },
    freshness: { cadence: 'realtime' },
    docUrl: 'https://www.weather.gov/documentation/services-web-api',
    lastVerified: '2026-09-21',
    liveLayer: true,
    tags: ['forecast', 'alerts'],
    ...overrides,
  }
}

export function makeEdge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: 'nws-api',
    target: 'coops-data',
    type: 'shared-id',
    label: 'lat/lon',
    sourceUrl: 'https://www.weather.gov/documentation/services-web-api',
    ...overrides,
  }
}

export function makeFile(nodes: unknown[] = [], edges: unknown[] = []): Record<string, unknown> {
  return { version: 1, nodes, edges }
}
