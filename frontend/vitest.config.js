import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Testler kullanıcıların saat diliminde koşar (backend/vitest.config.js ile aynı). CI UTC'de koşunca
// 'yerel saat' ile UTC aynı şey olur: sunucunun Z'siz UTC metnini yerel saat sanan kod (3 saat kayma,
// gece 00–03 arası yanlış gün) testlerden geçiyordu. Elle verilen TZ'ye dokunulmaz.
process.env.TZ ||= 'Europe/Istanbul'

// Birim + component smoke testleri. Playwright e2e (e2e/) hariç tutulur —
// onlar `npm run test:e2e` ile ayrı koşar.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
})
