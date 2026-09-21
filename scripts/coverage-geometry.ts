import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  DEFAULT_MAX_BYTES,
  PRESETS,
  boxesGeometry,
  extractPolygons,
  fitGeometry,
  processGeometry,
  selectPolygons,
  byteSize,
  type SourceGeometry,
} from '../src/data/coverageGeometry.ts'

const SOURCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
const CACHE_PATH = join(import.meta.dirname, '.cache', 'ne_50m_admin_0_countries.geojson')

const USAGE = `Generate schema-valid coverage geometry for a graph.json service node.

Usage:
  node scripts/coverage-geometry.ts --preset <name> [options]
  node scripts/coverage-geometry.ts --input <file.geojson> [options]

Presets:
${Object.entries(PRESETS)
  .map(([name, p]) => `  ${name.padEnd(18)}${p.description}`)
  .join('\n')}

Options:
  --preset <name>     Named reach (see above)
  --input <file>      GeoJSON Geometry/Feature/FeatureCollection; polygons are merged into one coverage
  --max-bytes <n>     Size target per geometry in bytes of minified JSON (default ${DEFAULT_MAX_BYTES});
                      tolerance is raised until the output fits
  --tolerance <deg>   Fixed Douglas-Peucker tolerance in degrees; disables the size fitting
  --out <file>        Write the coverage JSON here instead of stdout
  --refresh           Re-download the Natural Earth source data
  --help              Show this text

Output is the "coverage" value for a node (Polygon or MultiPolygon, 3 decimals, closed rings),
validated with coverageSchema from src/data/graphSchema.ts. The byte size, tolerance and vertex
count are reported on stderr so stdout stays pipeable.

Source data: Natural Earth 1:50m Admin 0 Countries (public domain, https://www.naturalearthdata.com/about/terms-of-use/).
It is downloaded on first use to scripts/.cache/ (gitignored); pass --refresh to fetch it again.
Presets without a country (us-coastal-waters, worldwide) are hand-defined boxes and need no download.
`

async function loadNaturalEarth(refresh: boolean): Promise<unknown> {
  if (refresh || !existsSync(CACHE_PATH)) {
    console.error(`Downloading ${SOURCE_URL}`)
    const response = await fetch(SOURCE_URL)
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    await mkdir(dirname(CACHE_PATH), { recursive: true })
    await writeFile(CACHE_PATH, await response.text())
  }
  return JSON.parse(await readFile(CACHE_PATH, 'utf8'))
}

async function sourceGeometry(values: { preset?: string; input?: string; refresh?: boolean }): Promise<SourceGeometry> {
  if (values.input) return extractPolygons(JSON.parse(await readFile(values.input, 'utf8')))
  const preset = PRESETS[values.preset!]
  if (!preset) throw new Error(`Unknown preset "${values.preset}". Choose one of: ${Object.keys(PRESETS).join(', ')}`)
  if (preset.boxes) return boxesGeometry(preset.boxes)
  const countries = (await loadNaturalEarth(Boolean(values.refresh))) as { features: Array<{ properties: { ADM0_A3: string } }> }
  const feature = countries.features.find((f) => f.properties.ADM0_A3 === preset.country)
  if (!feature) throw new Error(`Country ${preset.country} not found in source data`)
  const all = extractPolygons(feature)
  return preset.select ? selectPolygons(all, preset.select) : all
}

async function main() {
  const { values } = parseArgs({
    options: {
      preset: { type: 'string' },
      input: { type: 'string' },
      'max-bytes': { type: 'string' },
      tolerance: { type: 'string' },
      out: { type: 'string' },
      refresh: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  })
  if (values.help || (!values.preset && !values.input)) {
    console.error(USAGE)
    process.exit(values.help ? 0 : 1)
  }

  const geometry = await sourceGeometry(values)
  const maxBytes = Number(values['max-bytes'] ?? DEFAULT_MAX_BYTES)
  let coverage
  let tolerance: number
  if (values.tolerance !== undefined) {
    tolerance = Number(values.tolerance)
    coverage = processGeometry(geometry, tolerance)
  } else {
    const fit = fitGeometry(geometry, maxBytes)
    ;({ coverage, tolerance } = fit)
    if (!fit.withinTarget) console.error(`WARNING: could not fit ${maxBytes} bytes (got ${fit.bytes})`)
  }

  const bytes = byteSize(coverage)
  const polygons = coverage.type === 'Polygon' ? [coverage.coordinates] : coverage.coordinates
  const vertices = polygons.reduce((sum, polygon) => sum + polygon.reduce((s, ring) => s + ring.length, 0), 0)
  console.error(`${coverage.type}: ${polygons.length} polygon(s), ${vertices} vertices, ${bytes} bytes (target ${maxBytes}), tolerance ${tolerance}deg`)

  const json = JSON.stringify(coverage)
  if (values.out) await writeFile(values.out, `${json}\n`)
  else console.log(json)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
