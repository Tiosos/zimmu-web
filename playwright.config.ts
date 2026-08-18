import { defineConfig, devices } from '@playwright/test'

// Environments that ship a pre-installed Chromium whose build differs from the one @playwright/test
// pins (e.g. Claude Code on the web) can point the runner at it by setting PW_CHROMIUM_EXECUTABLE,
// avoiding a `playwright install` that would fetch the pinned build. Unset — as on CI, which installs
// the pinned browser — the runner resolves Chromium itself, so the default path is unchanged.
const chromiumExecutable = process.env.PW_CHROMIUM_EXECUTABLE

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  // OCCT WASM boot (~120s budget) + canvas render poll must fit within this.
  timeout: 180_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
