import { describe, it, expect } from 'vitest'
import {
  WORK_MODES, modePanelPrefs, detectMode, modeLabel, loadWorkMode, saveWorkMode,
} from './workModes.js'
import { SCHEDULE_PANELS, defaultPanelPrefs, togglePanel } from './panelPrefs.js'

// Faz 15: on bir panel birden açıkken asıl tablo aşağı itiliyor ve kimse hepsine
// aynı anda bakmıyor. Mod, panel tercihlerini tek tıkla role uygun kümeye getirir.

const ANAHTARLAR = SCHEDULE_PANELS.map(p => p.key)

const sahteDepo = (baslangic = {}) => {
  const veri = { ...baslangic }
  return {
    getItem: k => (k in veri ? veri[k] : null),
    setItem: (k, v) => { veri[k] = String(v) },
  }
}

describe('mod tanımları', () => {
  it('her modun panelleri gerçek panel anahtarları olmalı', () => {
    WORK_MODES.forEach(m => {
      m.panels.forEach(p => expect(ANAHTARLAR).toContain(p))
    })
  })

  it('her mod etiketli ve açıklamalı', () => {
    WORK_MODES.forEach(m => {
      expect(m.label).toBeTruthy()
      expect(m.hint).toBeTruthy()
    })
  })

  it('"hepsi açık" modu bütün panelleri kapsar', () => {
    expect(new Set(WORK_MODES.find(m => m.key === 'all').panels)).toEqual(new Set(ANAHTARLAR))
  })
})

describe('mod → tercih', () => {
  it('moddaki paneli açar, dışındakini kapatır', () => {
    const p = modePanelPrefs('daily')
    expect(p.dayOperations).toBe(true)
    expect(p.crossLinks).toBe(true)
    expect(p.planning).toBe(false)
  })

  it('her panel anahtarı için bir değer üretir', () => {
    const p = modePanelPrefs('planner')
    ANAHTARLAR.forEach(k => expect(typeof p[k]).toBe('boolean'))
  })

  // Bilinmeyen mod tercihleri boşaltmamalı.
  it('bilinmeyen modda hepsini açık bırakır', () => {
    expect(modePanelPrefs('yok')).toEqual(defaultPanelPrefs())
  })
})

describe('tercih → mod', () => {
  it('mod tercihinden kendini tanır', () => {
    WORK_MODES.forEach(m => {
      expect(detectMode(modePanelPrefs(m.key))).toBe(m.key)
    })
  })

  // Elle değişiklik moddan çıkarır ama tercihi geri almaz.
  it('elle değişiklikten sonra özel olur', () => {
    const bozuk = togglePanel(modePanelPrefs('daily'), 'planning')
    expect(detectMode(bozuk)).toBe('custom')
    expect(bozuk.planning).toBe(true)
  })

  it('etiketi verir, bilinmeyende özel der', () => {
    expect(modeLabel('payroll')).toBe('Puantaj kontrolörü')
    expect(modeLabel('custom')).toBe('Özel')
  })
})

describe('kalıcılık', () => {
  it('modu yazar ve okur', () => {
    const depo = sahteDepo()
    saveWorkMode('planner', depo)
    expect(loadWorkMode(depo)).toBe('planner')
  })

  it('özel modu da hatırlar', () => {
    const depo = sahteDepo()
    saveWorkMode('custom', depo)
    expect(loadWorkMode(depo)).toBe('custom')
  })

  // Bozuk kayıt ekranı kilitlememeli.
  it('geçersiz kayıtta null döner', () => {
    expect(loadWorkMode(sahteDepo({ 'shifts.workMode.v1': 'saçma' }))).toBeNull()
    expect(loadWorkMode(sahteDepo())).toBeNull()
  })

  it('depolama kapalıysa çökmez', () => {
    const patlayan = { getItem: () => { throw new Error('kapalı') }, setItem: () => { throw new Error('kapalı') } }
    expect(loadWorkMode(patlayan)).toBeNull()
    expect(() => saveWorkMode('daily', patlayan)).not.toThrow()
  })
})
