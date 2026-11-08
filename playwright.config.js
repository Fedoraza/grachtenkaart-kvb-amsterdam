import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone-safari', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'small-iphone-safari', use: { ...devices['iPhone SE'], browserName: 'webkit' } },
    { name: 'android-chrome', use: { ...devices['Pixel 5'], browserName: 'chromium' } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node server.mjs',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
