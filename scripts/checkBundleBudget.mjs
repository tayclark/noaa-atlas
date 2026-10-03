// Fails when the production build outgrows its load budget (#47). Sizes are gzip bytes. The
// initial budgets cover what a first visit downloads before the finder and graph can render: the
// entry chunk, the chunks it imports statically and their CSS, read from Vite's manifest. The
// total budgets cover every JS and CSS file in `dist`, lazy chunks included: the globe chunk,
// MapLibre's own three files and the JPEG 2000 decoder (#264). The limits sit about 10% above the
// size measured when the budget was set, so growth has to be deliberate: raise a limit in the same
// PR that adds the weight, and say why. Total JS 700 to 720 kB: the GFS-Wave layer (#229) adds a
// lazily loaded JPEG 2000 decoder (about 9 kB gzip) plus its overlay code. 720 to 592 kB:
// MapLibre's shared chunk ships once instead of twice (#263), 714.0 to 585.6 kB. Initial budgets
// added when the globe went lazy (#264): 228.1 kB JS and 5.8 kB CSS. Initial JS 251 to 203 kB: the
// dataset catalogs load on first search focus or Datasets section (#269), 228.2 to 184.0 kB. The
// buoy lists left the globe chunk too; Total JS went 588.0 to 589.4 kB on the chunks' own overhead.

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../dist', import.meta.url).pathname
const KB = 1000
const JS = ['.js', '.mjs']
const CSS = ['.css']

export const BUDGETS = [
  { name: 'Initial JavaScript', scope: 'initial', ext: JS, maxGzipBytes: 203 * KB },
  { name: 'Initial CSS', scope: 'initial', ext: CSS, maxGzipBytes: 6.4 * KB },
  { name: 'Total JavaScript', scope: 'total', ext: JS, maxGzipBytes: 592 * KB },
  { name: 'Total CSS', scope: 'total', ext: CSS, maxGzipBytes: 19 * KB },
]

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

/** The `dist`-relative files the entry loads up front: its chunk, static imports and their CSS. */
function initialFiles(manifest) {
  const seen = new Set()
  const out = new Set()
  const visit = (key) => {
    if (seen.has(key)) return
    seen.add(key)
    const chunk = manifest[key]
    out.add(chunk.file)
    for (const css of chunk.css ?? []) out.add(css)
    for (const imported of chunk.imports ?? []) visit(imported)
  }
  for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) visit(key)
  return out
}

const manifest = JSON.parse(readFileSync(join(DIST, '.vite/manifest.json'), 'utf8'))
const initial = initialFiles(manifest)
const sizes = [...files(DIST)].map((path) => {
  const source = readFileSync(path)
  return { path: relative(DIST, path), ext: extname(path), source, gzip: gzipSync(source).length }
})
// MapLibre is external (vite.config.ts), so the manifest doesn't list it. Should an initial chunk
// import it statically again, its main and shared files count as initial too.
if (sizes.some((file) => initial.has(file.path) && file.source.includes('maplibre-gl.mjs'))) {
  for (const file of sizes) if (/^maplibre\/[^/]+\/maplibre-gl(-shared)?\.mjs$/.test(file.path)) initial.add(file.path)
}

let failed = false
for (const { name, scope, ext, maxGzipBytes } of BUDGETS) {
  const matching = sizes.filter((file) => ext.includes(file.ext) && (scope === 'total' || initial.has(file.path)))
  const total = matching.reduce((sum, file) => sum + file.gzip, 0)
  const ok = total <= maxGzipBytes
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${(total / KB).toFixed(1)} kB gzip of ${(maxGzipBytes / KB).toFixed(1)} kB budget (${matching.length} files)`)
}
if (failed) process.exit(1)
