import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  DEFAULT_MAX_BYTES,
  PRESETS,
  extractPolygons,
  fitGeometry,
  presetGeometry,
  presetSources,
  processGeometry,
  byteSize,
  type PresetSources,
  type SourceGeometry,
} from '../src/data/coverageGeometry.ts'

const NATURAL_EARTH = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
// The US EEZ polygons only (iso_sov1 = USA), from the Marine Regions WFS.
const EEZ_URL =
  "https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=MarineRegions:eez&outputFormat=application/json&cql_filter=iso_sov1='USA'"
const SOURCES: Record<keyof PresetSources, { url: string; file: string }> = {
  countries: { url: `${NATURAL_EARTH}/ne_50m_admin_0_countries.geojson`, file: 'ne_50m_admin_0_countries.geojson' },
  lakes: { url: `${NATURAL_EARTH}/ne_50m_lakes.geojson`, file: 'ne_50m_lakes.geojson' },
  eez: { url: EEZ_URL, file: 'marineregions_eez_usa.geojson' },
}

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

Source data, downloaded on first use to scripts/.cache/ (gitignored); pass --refresh to fetch it again:
- Natural Earth 1:50m Admin 0 Countries and Lakes (public domain, https://www.naturalearthdata.com/about/terms-of-use/).
- Marine Regions World EEZ, US polygons (CC BY 4.0: Flanders Marine Institute (2023). Maritime Boundaries
  Geodatabase: Maritime Boundaries and Exclusive Economic Zones (200NM), version 12. https://doi.org/10.14284/632).
Presets built only from boxes or caps (us-coastal-waters, worldwide, goes-east-west) need no download.
`

async function loadSource(name: keyof PresetSources, refresh: boolean): Promise<unknown> {
  const { url, file } = SOURCES[name]
  const path = join(import.meta.dirname, '.cache', file)
  if (refresh || !existsSync(path)) {
    console.error(`Downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, await response.text())
  }
  return JSON.parse(await readFile(path, 'utf8'))
}

async function sourceGeometry(values: { preset?: string; input?: string; refresh?: boolean }): Promise<SourceGeometry> {
  if (values.input) return extractPolygons(JSON.parse(await readFile(values.input, 'utf8')))
  const preset = PRESETS[values.preset!]
  if (!preset) throw new Error(`Unknown preset "${values.preset}". Choose one of: ${Object.keys(PRESETS).join(', ')}`)
  const sources: PresetSources = {}
  for (const name of presetSources(preset)) sources[name] = await loadSource(name, Boolean(values.refresh))
  return presetGeometry(preset, sources)
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
