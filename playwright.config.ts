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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /\.mobile\.spec\.ts$/ },
    // Phone specs (#78): Chromium emulating a Pixel 7 (touch, a coarse pointer, a 412x915 screen).
    // Only `*.mobile.spec.ts` files run here, so the rest of the suite isn't run twice.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /\.mobile\.spec\.ts$/ },
  ],
  // e2e runs against the dev server rather than `vite preview`. The production build's MapLibre
  // worker is now emitted (see the `maplibreWorker` plugin in vite.config.ts, #49), so switching
  // to a preview server is possible but hasn't been done.
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
