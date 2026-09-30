// Regenerates src/data/onestopDatasets.json (#68): a curated, slim snapshot of the OneStop catalog.
// The catalog holds about 107k collections and the search API caps `offset` near 9000, so a full
// crawl is impossible (see the #66 spike). Instead this takes the top hits of a few NOAA-relevant
// topic queries, keeps only what the detail panel shows, and drops anything already in
// nceiDatasets.json (matched by DOI or normalized title) or repeated across queries. Re-run to refresh:
//   npm run onestop-datasets

import { readFileSync, writeFileSync } from 'node:fs'

const SEARCH = 'https://data.noaa.gov/onestop/api/search/search/collection'
const OUT = new URL('../src/data/onestopDatasets.json', import.meta.url)
const NCEI = new URL('../src/data/nceiDatasets.json', import.meta.url)
const PER_QUERY = 50
const QUERIES = [
  'tides water level',
  'buoy ocean observations',
  'weather radar',
  'satellite imagery',
  'hurricane tropical cyclone',
  'fisheries stock assessment',
  'bathymetry seafloor',
  'sea surface temperature',
  'coral reef',
  'space weather solar',
  'climate normals',
  'tsunami',
]

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const doiOf = (attrs) => {
  const m = (attrs.citeAsStatements ?? []).join(' ').match(/doi:\s*(10\.\d{4,9}\/[^\s,;]+?)\.?(?:\s|$)/i)
  return m ? `https://doi.org/${m[1]}` : null
}
const infoLink = (attrs) => {
  const links = (attrs.links ?? []).filter((l) => l.linkUrl?.startsWith('https://'))
  const pick = links.find((l) => l.linkFunction === 'information') ?? links[0]
  return pick?.linkUrl ?? null
}
const slug = (s) => norm(s).replace(/ /g, '-').slice(0, 70).replace(/-$/, '')
const day = (iso) => (iso ? String(iso).slice(0, 10) : null)

const ncei = JSON.parse(readFileSync(NCEI, 'utf8'))
const seenDoi = new Set(ncei.map((d) => d.doi).filter(Boolean))
const seenName = new Set(ncei.map((d) => norm(d.name)))
const usedIds = new Set(ncei.map((d) => d.id))

const rows = []
for (const value of QUERIES) {
  const res = await fetch(SEARCH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries: [{ type: 'queryText', value }],
      page: { max: PER_QUERY, offset: 0 },
    }),
  })
  if (!res.ok) throw new Error(`OneStop search "${value}" failed (${res.status})`)
  const { data } = await res.json()
  if (!data?.length) throw new Error(`OneStop search "${value}" returned nothing`)
  for (const { id: uuid, attributes: a } of data) {
    const name = String(a.title ?? '').replace(/\s+/g, ' ').trim()
    const doi = doiOf(a)
    const link = doi ?? infoLink(a)
    if (!name || !link || !slug(name)) continue
    if ((doi && seenDoi.has(doi)) || seenName.has(norm(name))) continue
    if (doi) seenDoi.add(doi)
    seenName.add(norm(name))
    let id = slug(name)
    if (usedIds.has(id)) id = `${id.slice(0, 63).replace(/-$/, '')}-${uuid.slice(0, 6)}`
    usedIds.add(id)
    rows.push({
      id,
      name,
      summary: '',
      startDate: day(a.beginDate),
      endDate: day(a.endDate),
      frequency: null,
      formats: [],
      observationTypes: [],
      doi: link,
      serviceId: 'onestop-search-api',
    })
  }
}

if (rows.length < 100) throw new Error(`Only ${rows.length} rows survived; check the queries`)
rows.sort((a, b) => a.id.localeCompare(b.id))
writeFileSync(OUT, `${JSON.stringify(rows)}\n`)
console.log(`Wrote ${rows.length} datasets`)
