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

// IntersectionObserver — scroll-reveal (useReveal) kullanır, jsdom'da yok.
// Stub gözlemlemez (element görünür olmaz) — testler reduced/mock ile kontrol eder.
if (typeof globalThis !== 'undefined' && !globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
}
