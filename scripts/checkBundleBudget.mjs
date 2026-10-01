// Fails when the production build outgrows its load budget (#47). Sizes are gzip bytes of what a
// first visit downloads: the app's JS (including MapLibre's worker files) and its CSS. The limits
// sit about 10% above the size measured when the budget was set, so growth has to be deliberate:
// raise a limit in the same PR that adds the weight, and say why.

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../dist', import.meta.url).pathname
const KB = 1000

export const BUDGETS = [
  { name: 'JavaScript', ext: ['.js', '.mjs'], maxGzipBytes: 690 * KB },
  { name: 'CSS', ext: ['.css'], maxGzipBytes: 17 * KB },
]

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

const sizes = [...files(DIST)].map((path) => ({ path, ext: extname(path), gzip: gzipSync(readFileSync(path)).length }))
let failed = false
for (const { name, ext, maxGzipBytes } of BUDGETS) {
  const matching = sizes.filter((file) => ext.includes(file.ext))
  const total = matching.reduce((sum, file) => sum + file.gzip, 0)
  const ok = total <= maxGzipBytes
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${(total / KB).toFixed(1)} kB gzip of ${(maxGzipBytes / KB).toFixed(0)} kB budget (${matching.length} files)`)
}
if (failed) process.exit(1)
