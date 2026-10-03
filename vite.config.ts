import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// maplibre-gl 5+ starts its worker from a separate ESM file, and both the main module and the
// worker import a shared chunk by its bare name (#49). Bundling the main module would inline that
// chunk, so a visitor downloads it twice. The build therefore leaves maplibre-gl external and ships
// MapLibre's own three files side by side, where the main module finds the worker next to itself.
// The directory carries the version, so a cached old worker never pairs with a new bundle. (#263)
// Nothing preloads these files: only the lazy globe chunk imports MapLibre, so it's fetched when the
// globe mounts rather than competing with the entry chunk on first load (#264).
const maplibreExternal = (): Plugin => {
  const version: string = JSON.parse(
    readFileSync(new URL('./node_modules/maplibre-gl/package.json', import.meta.url), 'utf8'),
  ).version
  const dir = `maplibre/${version}`
  let base = '/'
  return {
    name: 'maplibre-external',
    apply: 'build',
    // Before Vite's own resolver, which would otherwise bundle the package.
    enforce: 'pre',
    configResolved(config) {
      base = config.base
    },
    resolveId(id) {
      if (id === 'maplibre-gl') return { id: `${base}${dir}/maplibre-gl.mjs`, external: true }
    },
    generateBundle() {
      for (const name of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs']) {
        this.emitFile({
          type: 'asset',
          fileName: `${dir}/${name}`,
          source: readFileSync(new URL(`./node_modules/maplibre-gl/dist/${name}`, import.meta.url)),
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Project Pages serves from /noaa-atlas/; the deploy workflow sets VITE_BASE. (#49)
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), maplibreExternal()],
  // scripts/checkBundleBudget.mjs reads the manifest to tell the initial load from lazy chunks (#264).
  build: { manifest: true },
  // The GRIB decode worker (#291) imports the JPEG 2000 decoder lazily, and only ES-format workers
  // can split a chunk out.
  worker: { format: 'es' },
  // maplibre-gl loads its tile-parsing worker as a separate ESM chunk at
  // runtime; Vite's dep pre-bundling doesn't discover that chunk, so the
  // worker 404s unless maplibre-gl is excluded from pre-bundling. (#82 spike)
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // Allows sharing the local dev server over an ngrok tunnel — free-tier ngrok assigns a new
  // random subdomain per session, so this is a suffix match rather than one fixed hostname.
  server: { allowedHosts: ['.ngrok-free.app'] },
  test: {
    environment: 'node',
    // Vitest blanks CSS by default; contrast.test.ts reads the design tokens out of index.css.
    css: { include: /src\/index\.css/ },
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/components/globe/MapLibreGlobe.tsx',
        'src/components/globe/windOverlay.ts',
        'src/components/graph/GraphView.tsx',
        'src/data/jpx/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 75, statements: 75, functions: 75, branches: 75 },
    },
  },
})
