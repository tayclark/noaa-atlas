import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // `vite preview` (the production build) was tried first as more CI-representative, but
  // maplibre-gl's worker script isn't emitted into `dist/` by `vite build` at all — the globe
  // never fires its 'load' event against a production build as a result. Every prior session's
  // manual Playwright verification used `npm run dev`, which is why this never surfaced before.
  // Worth a follow-up issue to fix the production build itself; out of scope here, so e2e runs
  // against the dev server like every prior manual check did.
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
