import { defineConfig, devices } from '@playwright/test';

const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 5178);
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 8120);
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'release-smoke',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node ./e2e/support/backend-fixture.mjs',
      env: {
        ...process.env,
        E2E_BACKEND_PORT: String(BACKEND_PORT),
        E2E_ALLOWED_ORIGIN: FRONTEND_URL,
      },
      url: `${BACKEND_URL}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT}`,
      env: {
        ...process.env,
        VITE_API_URL: BACKEND_URL,
      },
      url: FRONTEND_URL,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
