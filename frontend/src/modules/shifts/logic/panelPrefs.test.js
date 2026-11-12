import { describe, it, expect } from 'vitest'
import {
  SCHEDULE_PANELS, SIMPLE_PANELS, defaultPanelPrefs, normalizePanelPrefs, togglePanel,
  setAllPanels, hiddenPanelCount, loadPanelPrefs, savePanelPrefs,
} from './panelPrefs.js'

function sahteDepo(baslangic = {}) {
  const veri = { ...baslangic }
  return {
    getItem: k => (k in veri ? veri[k] : null),
    setItem: (k, v) => { veri[k] = v },
    _veri: veri,
  }
}

describe('panel tercihleri', () => {
  // Hepsi açıkken çizelge ekranın altına itiliyordu: varsayılan artık sade.
  it('varsayılanda yalnız yayın durumu açık — çizelge ilk ekranda görünür', () => {
    const v = defaultPanelPrefs()
    expect(Object.keys(v).sort()).toEqual(SCHEDULE_PANELS.map(p => p.key).sort())
    expect(Object.keys(v).filter(k => v[k])).toEqual(SIMPLE_PANELS)
    expect(SIMPLE_PANELS).toEqual(['publish'])
  })

  it('tek panel açılıp kapanır, diğerleri etkilenmez', () => {
    const kapali = togglePanel(setAllPanels(true), 'crossover')
    expect(kapali.crossover).toBe(false)
    expect(kapali.dayDetail).toBe(true)
    expect(togglePanel(kapali, 'crossover').crossover).toBe(true)
  })

  it('bilinmeyen anahtar hiçbir şeyi bozmaz', () => {
    expect(togglePanel(defaultPanelPrefs(), 'yokBoyleBirSey')).toEqual(defaultPanelPrefs())
  })

  it('hepsini aç / hepsini kapat', () => {
    expect(Object.values(setAllPanels(false)).every(v => v === false)).toBe(true)
    expect(Object.values(setAllPanels(true)).every(v => v === true)).toBe(true)
  })

  // Kaç panelin kapalı olduğu düğmede yazacak: kullanıcı bir paneli kapatıp
  // unutunca "veri gelmiyor" sanmasın.
  it('kapalı panel sayısını verir', () => {
    expect(hiddenPanelCount(setAllPanels(true))).toBe(0)
    expect(hiddenPanelCount(defaultPanelPrefs())).toBe(SCHEDULE_PANELS.length - SIMPLE_PANELS.length)
    expect(hiddenPanelCount(setAllPanels(false))).toBe(SCHEDULE_PANELS.length)
  })

  // Eksik anahtar varsayılanı alır (yeni eklenen panel kendiliğinden açılıp ekranı doldurmaz);
  // kullanıcının açıkça seçtiği değer korunur.
  it('eksik anahtarlar varsayılana düşer, fazlalıklar atılır', () => {
    const v = normalizePanelPrefs({ dayDetail: true, publish: false, eskiPanel: true })
    expect(v.dayDetail).toBe(true)
    expect(v.publish).toBe(false)
    expect(v.coverage).toBe(false)
    expect(v.eskiPanel).toBeUndefined()
  })

  it('bozuk veya boş girdide varsayılan döner', () => {
    expect(normalizePanelPrefs(null)).toEqual(defaultPanelPrefs())
    expect(normalizePanelPrefs('bozuk')).toEqual(defaultPanelPrefs())
  })
})

describe('panel tercihleri — depolama', () => {
  it('kaydedip geri okur', () => {
    const depo = sahteDepo()
    savePanelPrefs(togglePanel(setAllPanels(true), 'coverage'), depo)
    expect(loadPanelPrefs(depo).coverage).toBe(false)
    expect(loadPanelPrefs(depo).dayDetail).toBe(true)
  })

  it('kayıt yokken varsayılan döner', () => {
    expect(loadPanelPrefs(sahteDepo())).toEqual(defaultPanelPrefs())
  })

  // Bozuk JSON okunamayınca panel kaybolmamalı, açık gelmeli.
  it('bozuk kayıtta varsayılana düşer', () => {
    expect(loadPanelPrefs(sahteDepo({ 'shifts.schedulePanels.v1': '{bozuk' }))).toEqual(defaultPanelPrefs())
  })

  it('depolama kapalıysa çökmez', () => {
    const patlayan = { getItem: () => { throw new Error('kapalı') }, setItem: () => { throw new Error('kapalı') } }
    expect(loadPanelPrefs(patlayan)).toEqual(defaultPanelPrefs())
    expect(() => savePanelPrefs(defaultPanelPrefs(), patlayan)).not.toThrow()
  })
})
