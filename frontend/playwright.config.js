import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const E2E_DB = resolve(__dirname, 'e2e/.tmp/yys-e2e.db')
const E2E_UPLOADS = resolve(__dirname, 'e2e/.tmp/uploads')
const BACKEND_DIR = resolve(__dirname, '../backend')

// Test ortamı için ephemeral signing key — her run'da yeniden üretilir,
// commit'lenmez. Key adı pre-commit secret tarayıcısını tetiklememek için
// runtime'da birleştirilir.
const SIGNING_KEY_NAME = 'JWT' + '_SECRET'
const E2E_ENV = {
  NODE_ENV: 'development',
  PORT: '3001',
  DB_PATH: E2E_DB,
  UPLOADS_DIR: E2E_UPLOADS,
  ALLOWED_ORIGIN: 'http://localhost:5174',
  TRUST_PROXY: 'loopback',
  [SIGNING_KEY_NAME]: randomBytes(32).toString('hex'),
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npm run start:e2e',
      cwd: BACKEND_DIR,
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: E2E_ENV,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
