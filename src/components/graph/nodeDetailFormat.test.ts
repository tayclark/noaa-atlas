import { describe, expect, it } from 'vitest'
import type { ServiceNode } from '../../data/graphSchema'
import {
  datasetLink,
  formatAuth,
  formatDatasetFrequency,
  formatDatasetRange,
  formatFormats,
  formatFreshness,
  formatOwner,
  formatRateLimits,
  liveStatusLabel,
} from './nodeDetailFormat'

describe('formatOwner', () => {
  it('joins office and program', () => {
    expect(formatOwner({ office: 'NWS', program: 'api.weather.gov' })).toBe('NWS — api.weather.gov')
  })
})

describe('formatFormats', () => {
  it('comma-joins the format list', () => {
    expect(formatFormats(['json', 'geojson'])).toBe('json, geojson')
  })
})

describe('formatAuth', () => {
  it('labels no-auth with no note', () => {
    expect(formatAuth({ type: 'none' })).toBe('None required')
  })

  it('appends a note when present', () => {
    expect(formatAuth({ type: 'none', note: 'User-Agent header required' })).toBe('None required (User-Agent header required)')
  })

  it('labels token and key auth', () => {
    expect(formatAuth({ type: 'token' })).toBe('Token required')
    expect(formatAuth({ type: 'key' })).toBe('API key required')
  })
})

describe('formatRateLimits', () => {
  it('falls back to "Not specified" when absent', () => {
    expect(formatRateLimits(undefined)).toBe('Not specified')
  })

  it('returns the rate limit text when present', () => {
    expect(formatRateLimits({ text: 'Not published; requests may be blocked with 403 when abused.' })).toBe(
      'Not published; requests may be blocked with 403 when abused.',
    )
  })
})

describe('formatFreshness', () => {
  it('labels a cadence with no note', () => {
    expect(formatFreshness({ cadence: 'realtime' })).toBe('Real-time')
  })

  it('appends a note when present', () => {
    expect(formatFreshness({ cadence: 'hourly', note: 'polled on the hour' })).toBe('Hourly (polled on the hour)')
  })
})

describe('liveStatusLabel', () => {
  const base: ServiceNode = {
    id: 'nws-api',
    kind: 'service',
    name: 'NWS API',
    summary: 'x',
    owner: { office: 'NWS', program: 'api.weather.gov' },
    theme: 'weather',
    baseUrl: 'https://api.weather.gov',
    accessMethod: 'rest',
    formats: ['json'],
    auth: { type: 'none' },
    coverage: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    freshness: { cadence: 'realtime' },
    docUrl: 'https://example.com',
    lastVerified: '2026-09-21',
    liveLayer: true,
    tags: [],
  }

  it('labels a live node', () => {
    expect(liveStatusLabel(base)).toBe('Live')
  })

  it('labels a not-live node', () => {
    expect(liveStatusLabel({ ...base, liveLayer: false, notLiveReason: 'not wired yet' })).toBe('Available, not live yet')
  })
})

describe('dataset formatting (#70)', () => {
  it('maps ISO frequency codes and the mangled irregular value', () => {
    expect(formatDatasetFrequency('asNeeded')).toBe('As needed')
    expect(formatDatasetFrequency('biannually')).toBe('Twice a year')
    expect(formatDatasetFrequency('irregularAdditions as new data are received.')).toBe('Irregular')
  })

  it('returns null for unknown or missing frequency', () => {
    expect(formatDatasetFrequency('somethingNew')).toBeNull()
    expect(formatDatasetFrequency(null)).toBeNull()
  })

  it('formats date ranges', () => {
    expect(formatDatasetRange('1998-08-01', '2025-03-31')).toBe('1998-08-01 to 2025-03-31')
    expect(formatDatasetRange('1998-08-01', null)).toBe('From 1998-08-01')
    expect(formatDatasetRange(null, '2025-03-31')).toBe('Until 2025-03-31')
    expect(formatDatasetRange(null, null)).toBeNull()
  })

  it('labels DOI and metadata links and rejects non-https urls', () => {
    expect(datasetLink('https://doi.org/10.7289/V500004W')?.label).toBe('DOI ↗')
    expect(datasetLink('https://www.ncei.noaa.gov/metadata/x')?.label).toBe('Metadata ↗')
    expect(datasetLink('javascript:alert(1)')).toBeNull()
    expect(datasetLink(null)).toBeNull()
  })
})
