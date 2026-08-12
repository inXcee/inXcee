import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_ITEMS } from './settingsNav.js'

// Bu dosya bir DÜZENİ korur, davranışı değil.
//
// Menü tanımı ile rota koruması ayrı yerlerde tutulduğunda sessizce ayrışmıştı:
// iki sayfa menüde gizliyken URL'den açılıyordu (girince her istek 403, sayfa
// boş), bir sayfa menüde görünüp tıklanınca ana sayfaya atıyordu. Hiçbiri
// hata vermiyordu — sadece yanlış çalışıyordu.
//
// Artık ikisi de settingsNav.js'ten besleniyor. Bu test, birine eklenip
// diğerine eklenmeyen sayfayı yakalar.

const appPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../App.jsx')
const app = readFileSync(appPath, 'utf-8')

const settingsBlok = () => {
  const bas = app.indexOf('<Route path="settings" element=')
  expect(bas, 'App.jsx içinde /settings rota bloğu bulunamadı').toBeGreaterThan(-1)
  const son = app.indexOf('</Route>', app.indexOf('<Route path="archived-personnel"', bas))
  return app.slice(bas, son)
}

const rotaAnahtarlari = () => [...settingsBlok().matchAll(/settingsKey="([a-z-]+)"/g)].map(m => m[1])

describe('ayar rotaları menü tanımıyla eşleşir', () => {
  it('menüdeki her sayfanın korumalı bir rotası var', () => {
    const rotalar = new Set(rotaAnahtarlari())
    const eksik = ALL_ITEMS.map(i => i.key).filter(k => !rotalar.has(k))
    expect(eksik, 'menüde var ama App.jsx içinde SettingsRoute ile rota tanımlanmamış').toEqual([])
  })

  // Menüde olmayan rota = kimsenin göremediği ama URL'den açılan sayfa.
  it('menüde tanımsız ayar rotası yok', () => {
    const menu = new Set(ALL_ITEMS.map(i => i.key))
    const fazla = rotaAnahtarlari().filter(k => !menu.has(k))
    expect(fazla, 'App.jsx içinde rota var ama settingsNav.js içinde tanımı yok').toEqual([])
  })

  it('rota anahtarları benzersiz', () => {
    const r = rotaAnahtarlari()
    expect(new Set(r).size).toBe(r.length)
  })

  // Eski RoleRoute sarmalı kalırsa yetki yine iki yerde tutulmuş olur.
  it('ayar rotalarında eski RoleRoute sarmalı kalmamış', () => {
    const blok = settingsBlok()
    // Parent'taki tek RoleRoute beklenen; çocuklarda olmamalı.
    const cocukSatirlari = blok.split('\n').filter(l => l.includes('settingsKey='))
    expect(cocukSatirlari.filter(l => l.includes('RoleRoute'))).toEqual([])
  })
})
