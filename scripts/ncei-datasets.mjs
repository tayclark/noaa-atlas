// Regenerates src/data/nceiDatasets.json (#62): a slim snapshot of the NCEI search v1 catalog.
// The API is tokenless and returns every dataset (about 100) in one page, but each record carries
// long descriptions, people and per-variable lists, so the app ships only the fields it needs.
// Datasets the Access Data Service can subset (`searchable`) link to that node; the rest link to
// the OneStop discovery node. Re-run when NCEI adds datasets:
//   npm run ncei-datasets

import { writeFileSync } from 'node:fs'

const URL_ = 'https://www.ncei.noaa.gov/access/services/search/v1/datasets?limit=1000'
const OUT = new URL('../src/data/nceiDatasets.json', import.meta.url)
const SUMMARY_MAX = 240

const res = await fetch(URL_)
if (!res.ok) throw new Error(`NCEI dataset search failed (${res.status})`)
const { results, totalCount } = await res.json()
if (results.length !== totalCount) {
  throw new Error(`Got ${results.length} of ${totalCount} datasets; the catalog now needs paging`)
}

const summarize = (text) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= SUMMARY_MAX) return t
  return `${t.slice(0, SUMMARY_MAX - 1).replace(/\s+\S*$/, '')}…`
}

const rows = results
  .map((d) => ({
    id: String(d.id),
    name: String(d.name).trim(),
    summary: summarize(d.description),
    startDate: d.startDate ?? null,
    endDate: d.endDate ?? null,
    frequency: d.frequency ?? null,
    formats: (d.formats ?? []).map((f) => f.id),
    observationTypes: (d.observationTypes ?? []).map((o) => o.id),
    doi: d.doiLink ?? null,
    serviceId: d.searchable ? 'ncei-access-data-service' : 'onestop-search-api',
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

writeFileSync(OUT, `${JSON.stringify(rows)}\n`)
console.log(`Wrote ${rows.length} datasets`)
