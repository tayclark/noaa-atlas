// Re-verifies every URL curated in src/data/graph.json with a real GET (#48).
// Usage: npm run verify:data [-- --out /absolute/report.json]
// A browser User-Agent is used because several NOAA hosts 403 unknown agents.
// Network-bound, so it is a manual check and not part of CI or the unit tests.
import { readFileSync, writeFileSync } from 'node:fs'

const ORIGIN = 'http://localhost:5173'
const CONCURRENCY = 8
const TIMEOUT_MS = 20000
const DEPRECATION = /\b(deprecated|decommission(?:ed|ing)?|sunsetting|end[- ]of[- ]life|no longer (?:available|supported|maintained))\b/i

const outIndex = process.argv.indexOf('--out')
const outPath = outIndex > -1 ? process.argv[outIndex + 1] : null

const graph = JSON.parse(readFileSync(new URL('../src/data/graph.json', import.meta.url), 'utf8'))

/** url -> { kinds: Set, nodes: Set, headers } */
const targets = new Map()
function add(url, kind, owner, headers) {
  if (!url) return
  const t = targets.get(url) ?? { kinds: new Set(), owners: new Set(), headers: {} }
  t.kinds.add(kind)
  t.owners.add(owner)
  Object.assign(t.headers, headers)
  targets.set(url, t)
}
for (const n of graph.nodes) {
  add(n.baseUrl, 'baseUrl', n.id)
  add(n.docUrl, 'docUrl', n.id)
  add(n.sample?.url, 'sample', n.id, n.sample?.headers)
  add(n.rateLimits?.sourceUrl, 'rateLimits', n.id)
}
for (const e of graph.edges) add(e.sourceUrl, 'edge', `${e.source}->${e.target}`)

async function check(url, info, attempt = 0) {
  try {
    const res = await fetch(url, {
      headers: { Origin: ORIGIN, Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', ...info.headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const isDoc = info.kinds.has('docUrl') || info.kinds.has('rateLimits') || info.kinds.has('edge')
    const type = res.headers.get('content-type') ?? ''
    let deprecationHint = null
    if (isDoc && /html|text/.test(type)) {
      const body = (await res.text()).slice(0, 400000)
      deprecationHint = body.match(DEPRECATION)?.[0] ?? null
    } else {
      await res.body?.cancel()
    }
    return {
      url,
      status: res.status,
      finalUrl: res.url === url ? null : res.url,
      cors: res.headers.get('access-control-allow-origin'),
      contentType: type,
      deprecationHint,
    }
  } catch (err) {
    if (attempt < 1) return check(url, info, attempt + 1)
    return { url, status: 0, error: String(err?.cause?.code ?? err?.message ?? err) }
  }
}

const entries = [...targets.entries()]
const results = []
let next = 0
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < entries.length) {
      const [url, info] = entries[next++]
      const r = await check(url, info)
      results.push({ ...r, kinds: [...info.kinds], owners: [...info.owners] })
    }
  }),
)
results.sort((a, b) => a.url.localeCompare(b.url))

const liveNodes = new Set(graph.nodes.filter((n) => n.liveLayer).map((n) => n.id))
const sameHost = (a, b) => new URL(a).host === new URL(b).host
const stripSlash = (u) => u.replace(/\/+$/, '').replace(/#.*$/, '')
const flags = []
for (const r of results) {
  const why = []
  if (r.status === 0) why.push(`request failed (${r.error})`)
  else if (r.status >= 400) why.push(`HTTP ${r.status}`)
  if (r.finalUrl && stripSlash(r.finalUrl) !== stripSlash(r.url)) {
    why.push(sameHost(r.url, r.finalUrl) ? `redirects to ${r.finalUrl}` : `MOVED HOST: ${r.finalUrl}`)
  }
  if (r.kinds.includes('sample') && r.owners.some((o) => liveNodes.has(o)) && r.status > 0 && r.status < 400 && !r.cors) why.push('sample has no access-control-allow-origin')
  if (r.deprecationHint) why.push(`page mentions "${r.deprecationHint}"`)
  if (why.length) flags.push({ url: r.url, kinds: r.kinds, owners: r.owners, why })
}

if (outPath) writeFileSync(outPath, JSON.stringify({ checked: results.length, flags, results }, null, 2) + '\n')
console.log(`Checked ${results.length} unique URLs; ${flags.length} flagged.`)
for (const f of flags) console.log(`\n${f.url}\n  used by: ${f.kinds.join(',')} (${f.owners.join(', ')})\n  - ${f.why.join('\n  - ')}`)
process.exitCode = flags.some((f) => f.why.some((w) => w.startsWith('HTTP') || w.startsWith('request') || w.startsWith('MOVED'))) ? 1 : 0
