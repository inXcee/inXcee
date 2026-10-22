import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const backendTarget = process.env.VITE_BACKEND_TARGET || 'http://localhost:3001'

// Ağır ve nadir kullanılan kütüphaneler ayrı parça — ilk yüklemede inmez, sayfa açılınca lazy çekilir.
// Listede olmayan bağımlılıkları (recharts'ın d3/redux bağımlılıkları dahil) Rollup kullanıldıkları yere
// göre yerleştirir: yalnız lazy sayfaların kullandığı lazy kalır, giriş paketinin de kullandığı küçük
// ortak modül giriş tarafına düşer — 375 KB'lık grafik paketinin tamamı değil.
const VENDOR_CHUNKS = [
  // use-sync-external-store: zustand (giriş) + recharts ortak bağımlılığı — giriş tarafında kalmalı
  ['vendor-react', ['react', 'react-dom', 'react-router', 'react-router-dom', '@remix-run/router', 'scheduler', 'use-sync-external-store']],
  ['vendor-charts', ['recharts']],
  ['vendor-excel', ['exceljs']],
  ['vendor-qr', ['qrcode']],
  ['vendor-dnd', ['@dnd-kit/core', '@dnd-kit/utilities']],
  ['vendor-query', ['@tanstack/react-query', '@tanstack/query-core']],
]
function vendorChunk(id) {
  const path = id.replace(/\\/g, '/')
  const at = path.lastIndexOf('/node_modules/')
  if (at < 0) return undefined
  const parts = path.slice(at + '/node_modules/'.length).split('/')
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  return VENDOR_CHUNKS.find(([, pkgs]) => pkgs.includes(name))?.[0]
}

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
        // Paket adına göre (yol bazlı) atama. Eskiden nesne biçimiydi ({ 'vendor-charts': ['recharts'] }):
        // listelenen paketin TÜM bağımlılıkları o parçaya çekiliyordu. zustand'ın da kullandığı
        // use-sync-external-store recharts'ın bağımlılığı olarak vendor-charts'a düşüyor, giriş paketi onu
        // import ettiği için 375 KB'lık grafik paketi her ilk açılışta (giriş ekranı dahil) iniyordu.
        manualChunks: vendorChunk,
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
