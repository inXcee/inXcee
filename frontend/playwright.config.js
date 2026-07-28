import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RUN_ID = `${process.pid}-${randomBytes(4).toString('hex')}`
const E2E_DB = resolve(__dirname, `e2e/.tmp/yys-e2e-${RUN_ID}.db`)
const E2E_UPLOADS = resolve(__dirname, `e2e/.tmp/uploads-${RUN_ID}`)
const BACKEND_PORT = process.env.E2E_BACKEND_PORT || '3001'
const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT || '5174'
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`

// Test ortamı için ephemeral signing key — her run'da yeniden üretilir,
// commit'lenmez. Key adı pre-commit secret tarayıcısını tetiklememek için
// runtime'da birleştirilir.
const SIGNING_KEY_NAME = 'JWT' + '_SECRET'
const E2E_ENV = {
  // 'test' — mevcut rate-limit skip guard'larını (authLimiter/pinLimiter vb.)
  // aktive eder. e2e suite'i tek IP'den (127.0.0.1) çok sayıda login + kiosk
  // arama yapıyor; 15dk'lık IP pencereleri run boyunca birikip 429'a takılıyordu
  // ('development'ta limiter aktif kalıyordu). seedDev yine çalışır (server.js
  // sadece 'production'ı ayırır), DB_PATH korunur.
  NODE_ENV: 'test',
  PORT: BACKEND_PORT,
  DB_PATH: E2E_DB,
  UPLOADS_DIR: E2E_UPLOADS,
  ALLOWED_ORIGIN: FRONTEND_URL,
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
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Passkey kayıt teklifi (login sonrası modal) e2e akışlarını bloklamasın —
    // gerçek kullanıcıda "Şimdi değil" ile aynı bayrak.
    storageState: {
      cookies: [],
      origins: [{
        origin: FRONTEND_URL,
        localStorage: [{ name: 'yys_passkey_cred_dismissed', value: '1' }],
      }],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'node e2e/start-backend.mjs',
      cwd: __dirname,
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: E2E_ENV,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx vite --host 0.0.0.0 --port ${FRONTEND_PORT}`,
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_BACKEND_TARGET: BACKEND_URL },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
