// Mocks for the GFS wind overlay (#229). The bucket answers an `.idx` GET with the byte offsets and
// a Range GET with the field's GRIB2 message; the fixtures are a real GFS 1 degree 10 m UGRD
// message (served for both components) and a trimmed copy of its index.

import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

const GRIB = Buffer.from(readFileSync('src/data/fixtures/gfs-ugrd10m-f012.grib2.b64', 'utf8').trim(), 'base64')
const IDX = readFileSync('src/data/fixtures/gfs-1p00-f012.idx', 'utf8')

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
    if (url.endsWith('.idx')) return route.fulfill({ status: 200, contentType: 'text/plain', headers: cors, body: IDX })
    return route.fulfill({ status: 206, contentType: 'application/octet-stream', headers: cors, body: GRIB })
  })
  return seen
}
