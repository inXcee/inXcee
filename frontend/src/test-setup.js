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

// localStorage — bazı jsdom yapılandırmalarında setItem/getItem fonksiyon değil.
// In-memory basit bir Storage ile doldur (gerçek tarayıcıda zaten mevcut).
if (typeof globalThis !== 'undefined' && (typeof globalThis.localStorage?.setItem !== 'function')) {
  const store = new Map()
  const mem = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true, writable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: mem, configurable: true, writable: true })
  }
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
