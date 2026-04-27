import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
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
          'vendor-qr': ['qrcode', 'jsqr'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/utilities'],
          'vendor-query': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
})
