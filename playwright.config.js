// @ts-check
// Playwright config for Markdown Pro (static site).
// Run: npm test (starts a local server automatically if needed)

const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PLAYWRIGHT_PORT || 9321;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:' + PORT,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npx serve . -l ' + PORT,
    url: 'http://127.0.0.1:' + PORT + '/',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    cwd: __dirname,
  },
});
