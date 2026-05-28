// Vitest global setup — jest-dom matcher'ları (toBeInTheDocument vb.) ve
// jsdom'da eksik olan tarayıcı API'lerinin stub'ları.
import '@testing-library/jest-dom/vitest'

// matchMedia — bazı bileşenler responsive kontrolde kullanır, jsdom'da yok.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
