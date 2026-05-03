// web/playwright.config.ts
//
// Phase 3 (Logto) end-to-end smoke configuration.
//
// We assume the dev stack (postgres + redis + logto via
// docker-compose.dev.yml, the Go backend on :8080, and the Vite frontend
// on :5173) is already running. Spinning all three up automatically here
// is more orchestration than a smoke spec should own; instead the spec
// itself contains a beforeAll() that fails fast with a readable skip
// reason if the stack isn't reachable.
//
// Run:
//   pnpm e2e          # headless, chromium only
//   pnpm e2e:headed   # opens a real Chromium window
//   pnpm e2e:trace    # records a trace for the Playwright trace viewer

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Sequential -- single dev server, single Logto instance, mutates one
  // bootstrap admin's profile row. Parallelism would race.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    // Logto's hosted UI markup occasionally drifts between minor releases;
    // a retained trace makes selector breakage diagnosable in seconds.
    trace: 'retain-on-failure',
    headless: !process.env.HEADED,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  timeout: 60_000,
  expect: { timeout: 10_000 },
})
