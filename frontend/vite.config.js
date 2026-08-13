import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '0.0.0.0',
    // PORT verilmişse ona uyar (önizleme aracı boş bir port atıyor), verilmemişse
    // 5174'te kalır — CLAUDE.md, e2e varsayılanı ve WebAuthn dev origin'i bu port.
    // .env'deki PORT yalnız backend sürecine enjekte edilir, buraya sızmaz.
    port: Number(process.env.PORT) || 5174,
    proxy: {
      '/api': backendTarget,
      '/public': backendTarget,
      '/uploads': backendTarget,
    }
  },
  build: {
    // Ağır ve nadir kullanılan kütüphaneler ayrı chunk — ilk yüklemede inmez,
    // sayfa açılınca lazy çekilir. Hedef: initial JS < 250KB gz.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-excel': ['exceljs'],
          'vendor-qr': ['qrcode'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/utilities'],
          'vendor-query': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
