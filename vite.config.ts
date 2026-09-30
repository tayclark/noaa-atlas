import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// maplibre-gl 5+ starts its worker from a separate ESM file that imports a shared chunk by its
// bare name, so both must ship unhashed and side by side. (#49)
const maplibreWorker = (): Plugin => ({
  name: 'maplibre-worker',
  apply: 'build',
  generateBundle() {
    for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
      this.emitFile({
        type: 'asset',
        fileName: `maplibre/${name}`,
        source: readFileSync(new URL(`./node_modules/maplibre-gl/dist/${name}`, import.meta.url)),
      })
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  // Project Pages serves from /noaa-atlas/; the deploy workflow sets VITE_BASE. (#49)
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), maplibreWorker()],
  // maplibre-gl loads its tile-parsing worker as a separate ESM chunk at
  // runtime; Vite's dep pre-bundling doesn't discover that chunk, so the
  // worker 404s unless maplibre-gl is excluded from pre-bundling. (#82 spike)
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // Allows sharing the local dev server over an ngrok tunnel — free-tier ngrok assigns a new
  // random subdomain per session, so this is a suffix match rather than one fixed hostname.
  server: { allowedHosts: ['.ngrok-free.app'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/components/globe/MapLibreGlobe.tsx',
        'src/components/graph/GraphView.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 75, statements: 75, functions: 75, branches: 75 },
    },
  },
})
