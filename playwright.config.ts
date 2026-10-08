import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets several worktrees run their e2e suites in parallel.
const port = Number(process.env.E2E_PORT ?? 5199)

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.E2E_PORT,
  },
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
