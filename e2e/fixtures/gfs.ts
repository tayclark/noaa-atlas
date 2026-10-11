// Mocks for the GFS wind and wave overlays (#229). The bucket answers an `.idx` GET with the byte
// offsets and a Range GET with the field's GRIB2 message; the fixtures are a real GFS 1 degree 10 m
// UGRD message (served for both components) and a real GFS-Wave 0.25 degree HTSGW message, each with
// its index.

import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

// Resolved from this file, not the working directory, so Playwright can be run from anywhere.
const fixture = (name: string) => readFileSync(new URL(`../../src/data/fixtures/${name}`, import.meta.url), 'utf8')
const GRIB = Buffer.from(fixture('gfs-ugrd10m-f012.grib2.b64').trim(), 'base64')
const IDX = fixture('gfs-1p00-f012.idx')
const WAVE_GRIB = Buffer.from(fixture('gfswave-htsgw-f024.grib2.b64').trim(), 'base64')
const WAVE_IDX = fixture('gfswave-0p25-f024.idx')

export interface GfsRequest {
  url: string
  range: string | null
}

/** Serves the bucket for every cycle and hour, and returns the requests it saw. */
export async function mockGfs(page: Page): Promise<GfsRequest[]> {
  const seen: GfsRequest[] = []
  await page.route('https://noaa-gfs-bdp-pds.s3.amazonaws.com/**', (route) => {
    const request = route.request()
    const url = request.url()
    const range = request.headers()['range'] ?? null
    seen.push({ url, range })
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'range' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const wave = url.includes('/wave/gridded/')
    if (url.endsWith('.idx')) {
      return route.fulfill({ status: 200, contentType: 'text/plain', headers: cors, body: wave ? WAVE_IDX : IDX })
    }
    return route.fulfill({ status: 206, contentType: 'application/octet-stream', headers: cors, body: wave ? WAVE_GRIB : GRIB })
  })
  return seen
}
