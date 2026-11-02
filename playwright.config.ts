import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 120000,
  expect: { timeout: 60000 },
  workers: 1,
  use: { baseURL: 'http://localhost:5173', headless: true, trace: 'retain-on-failure' },
  reporter: [['list'], ['json', { outputFile: 'test-results/ui-results.json' }]],
  webServer: [
    { command: 'npm run dev:backend', url: 'http://localhost:3001/api/health', reuseExistingServer: true, timeout: 30000 },
    { command: 'npm run dev:frontend', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 30000 },
  ],
});
