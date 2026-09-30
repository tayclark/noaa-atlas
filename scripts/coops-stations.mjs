// Regenerates src/data/coopsStations.json (#51): the CO-OPS water-level stations the globe draws.
// The Metadata API's full list is about 780 KB, mostly per-station links, so the app ships this
// snapshot (id, name, position, state) instead of fetching the list on every page load. Stations
// change rarely; re-run after CO-OPS adds or retires one:
//   npm run coops-stations

import { writeFileSync } from 'node:fs'

const URL_ =
  'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels'
const OUT = new URL('../src/data/coopsStations.json', import.meta.url)

const res = await fetch(URL_)
if (!res.ok) throw new Error(`CO-OPS station list failed (${res.status})`)
const { stations } = await res.json()

const rows = stations
  .map((s) => ({
    id: String(s.id),
    name: String(s.name).trim(),
    lat: Number(s.lat),
    lng: Number(s.lng),
    state: s.state ? String(s.state) : '',
  }))
  .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
  .sort((a, b) => a.id.localeCompare(b.id))

writeFileSync(OUT, `${JSON.stringify(rows)}\n`)
console.log(`Wrote ${rows.length} stations`)
