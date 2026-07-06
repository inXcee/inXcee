import { describe, it, expect } from 'vitest'

// "Sayfa açılmıyor" taraması: tüm sayfa modüllerini gerçekten import eder.
// Build paketler ama ÇALIŞTIRMAZ — modül-değerlendirme anındaki hatalar
// (top-level undefined çağrı, kırık import zinciri) ancak burada yakalanır.
const pageModules = import.meta.glob('../modules/**/*Page.jsx')

describe('tüm sayfa modülleri yüklenebilir', () => {
  const entries = Object.entries(pageModules)

  it('en az 40 sayfa modülü bulundu (glob çalışıyor)', () => {
    expect(entries.length).toBeGreaterThan(40)
  })

  for (const [path, importer] of entries) {
    it(`import: ${path.replace('../modules/', '')}`, async () => {
      const mod = await importer()
      expect(mod.default).toBeTypeOf('function') // her sayfa bir React bileşeni export eder
    })
  }
})
