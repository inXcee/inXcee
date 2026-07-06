import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

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
