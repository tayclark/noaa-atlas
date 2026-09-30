// Regenerates src/data/awsOpenDataDatasets.json (#64): a slim snapshot of the NOAA-managed entries
// in the AWS Open Data registry (github.com/awslabs/open-data-registry, one YAML file per dataset).
// No entry carries a `noaa` tag, so NOAA entries are picked by their `ManagedBy` field, plus an
// allow list of NOAA data hosted by others and a deny list of third-party derivatives. Each row
// attaches to the existing bucket node whose host matches the entry's first S3 bucket, falling
// back to the registry catalog node. Rows already in the NCEI or OneStop snapshots (matched by
// normalized title) are dropped. Summaries are left empty because
// the panel doesn't show them. Uses the system `tar` to unpack the repo archive. Re-run to refresh:
//   npm run aws-open-data-datasets

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'

const ARCHIVE = 'https://codeload.github.com/awslabs/open-data-registry/tar.gz/refs/heads/main'
const OUT = new URL('../src/data/awsOpenDataDatasets.json', import.meta.url)
const read = (name) => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'))
const FALLBACK = 'aws-open-data-noaa'
const ALLOW = new Set([
  'noaa-gfs-pds',
  'noaa-nexrad',
  'nexrad-arco',
  'noaa-nos-cora',
  'noaa-s104',
  'noaa-nesdis-tcprimed-pds',
  'noaa-ioos-roms-doppio',
])
const DENY = /^(dynamical-noaa-|aodn_)/

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const clean = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

const nodes = read('graph.json').nodes
const bucketNodes = new Map()
for (const n of nodes) {
  const host = /^https:\/\/([a-z0-9.-]+)\.s3\.amazonaws\.com\//.exec(n.baseUrl ?? '')
  if (host) bucketNodes.set(host[1], n.id)
}
if (!nodes.some((n) => n.id === FALLBACK)) throw new Error(`Missing node ${FALLBACK}`)

const seenName = new Set([...read('nceiDatasets.json'), ...read('onestopDatasets.json')].map((d) => norm(d.name)))

const dir = mkdtempSync(join(tmpdir(), 'aws-registry-'))
let files
try {
  const res = await fetch(ARCHIVE)
  if (!res.ok) throw new Error(`Registry archive failed (${res.status})`)
  const archive = join(dir, 'registry.tar.gz')
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
  execFileSync('tar', ['-xzf', archive, '-C', dir, '--include', '*/datasets/*.yaml'])
  const root = join(dir, readdirSync(dir).find((f) => f.startsWith('open-data-registry')), 'datasets')
  files = readdirSync(root)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => {
      try {
        return { slug: f.slice(0, -5), doc: parse(readFileSync(join(root, f), 'utf8')) }
      } catch (err) {
        console.warn(`Skipping ${f}: ${err.message.split('\n')[0]}`)
        return null
      }
    })
    .filter(Boolean)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
if (files.length < 500) throw new Error(`Only ${files.length} registry files found`)

const rows = []
for (const { slug, doc } of files) {
  if (!doc?.Name || DENY.test(slug)) continue
  if (!/noaa/i.test(String(doc.ManagedBy ?? '')) && !ALLOW.has(slug)) continue
  if (doc.Deprecated) continue
  const name = clean(doc.Name)
  if (seenName.has(norm(name))) continue
  seenName.add(norm(name))
  const bucket = (doc.Resources ?? [])
    .map((r) => (r.Type === 'S3 Bucket' ? /^arn:aws:s3:::([^/]+)/.exec(r.ARN ?? '')?.[1] : null))
    .find(Boolean)
  rows.push({
    id: slug,
    name,
    summary: '',
    startDate: null,
    endDate: null,
    frequency: doc.UpdateFrequency ? clean(doc.UpdateFrequency) : null,
    formats: [],
    observationTypes: (doc.Tags ?? []).filter((t) => t !== 'aws-pds').map(String),
    doi: `https://registry.opendata.aws/${slug}/`,
    serviceId: bucketNodes.get(bucket) ?? FALLBACK,
  })
}

if (rows.length < 50) throw new Error(`Only ${rows.length} rows survived; check the filter`)
rows.sort((a, b) => a.id.localeCompare(b.id))
writeFileSync(OUT, `${JSON.stringify(rows)}\n`)
console.log(`Wrote ${rows.length} datasets`)
