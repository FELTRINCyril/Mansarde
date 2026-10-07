import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://localhost:5199' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
