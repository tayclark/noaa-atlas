// Regenerates src/data/ndbcStations.json: the moored buoys (type buoy and tao) the globe draws
// while the NDBC realtime node is selected. NDBC sends no CORS headers, so the app ships this
// snapshot (id, name, position) instead of fetching it. Stations change rarely; re-run after NDBC
// adds or retires one:
//   npm run ndbc-stations

import { writeFileSync } from 'node:fs'

const URL_ = 'https://www.ndbc.noaa.gov/activestations.xml'
const OUT = new URL('../src/data/ndbcStations.json', import.meta.url)

const res = await fetch(URL_)
if (!res.ok) throw new Error(`NDBC station list failed (${res.status})`)
const xml = await res.text()

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
const decode = (s) => s.replace(/&(amp|quot|apos|lt|gt);/g, (_, e) => ENTITIES[e])

const rows = (xml.match(/<station\b[^>]*>/g) ?? [])
  .filter((tag) => ['buoy', 'tao'].includes(attr(tag, 'type')))
  .map((tag) => ({
    id: attr(tag, 'id'),
    // Some stations are unnamed; the popup falls back to the id.
    name: decode(attr(tag, 'name') ?? '').trim() || attr(tag, 'id'),
    lat: Number(attr(tag, 'lat')),
    lng: Number(attr(tag, 'lon')),
  }))
  .filter((s) => s.id && Number.isFinite(s.lat) && Number.isFinite(s.lng))
  .sort((a, b) => a.id.localeCompare(b.id))

writeFileSync(OUT, `${JSON.stringify(rows)}\n`)
console.log(`Wrote ${rows.length} stations`)
