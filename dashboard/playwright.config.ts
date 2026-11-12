// End-to-end tests of the owner's core flows (chat, approval, forget) in a real browser, against
// the development build's preview gateway (src/dev/gateway-preview.tsx): the same live screens,
// fed by an in-memory fake, so no server or sign-in is needed. Each page load starts a fresh fake.
// Run: npm run e2e (starts its own dev server on E2E_PORT, default 5199).
import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT || 5199)

export default defineConfig({
  testDir: 'e2e',
  // The dev server compiles each screen on first visit; a cold screen can take a while.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npm run dev -- --host localhost --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
})
