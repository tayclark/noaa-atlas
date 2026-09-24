import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
