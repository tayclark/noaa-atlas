// Regenerates src/data/dartStations.json (#80): the DART tsunami buoys the globe draws while the
// NDBC DART node is selected. NDBC's active-stations feed lists every buoy type, so the app ships
// this snapshot (id, name, position) instead of fetching it. Stations change rarely; re-run after
// NDBC adds or retires one:
//   npm run dart-stations

import { writeFileSync } from 'node:fs'

const URL_ = 'https://www.ndbc.noaa.gov/activestations.xml'
const OUT = new URL('../src/data/dartStations.json', import.meta.url)

const res = await fetch(URL_)
if (!res.ok) throw new Error(`NDBC station list failed (${res.status})`)
const xml = await res.text()

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

const rows = (xml.match(/<station\b[^>]*>/g) ?? [])
  .filter((tag) => attr(tag, 'type') === 'dart')
  .map((tag) => ({
    id: attr(tag, 'id'),
    name: decode(attr(tag, 'name') ?? '').trim(),
    lat: Number(attr(tag, 'lat')),
    lng: Number(attr(tag, 'lon')),
  }))
  .filter((s) => s.id && Number.isFinite(s.lat) && Number.isFinite(s.lng))
  .sort((a, b) => a.id.localeCompare(b.id))

writeFileSync(OUT, `${JSON.stringify(rows)}\n`)
console.log(`Wrote ${rows.length} stations`)
