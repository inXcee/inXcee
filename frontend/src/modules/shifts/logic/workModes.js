import { SCHEDULE_PANELS, normalizePanelPrefs } from './panelPrefs.js'

// Faz 15 — Çalışma modları.
//
// Faz 1-14 boyunca çizelgenin altına on bir panel eklendi. Hepsi birden açıkken
// asıl tablo aşağı itiliyor ve kimse hepsine aynı anda bakmıyor: planlayan kişi
// açık vardiyaya ve öneriye bakar, gün amiri günlük operasyona ve bağlara,
// puantajcı hazırlık ve aksiyon merkezine.
//
// Mod, panel tercihlerini TEK tıkla o role uygun kümeye getirir. Elle değişiklik
// yapılınca mod 'custom' olur — kullanıcının seçtiği panel sessizce geri
// alınmaz, sadece artık bir modla eşleşmediği söylenir.

const KEY = 'shifts.workMode.v1'

export const WORK_MODES = [
  {
    key: 'planner',
    label: 'Planlayıcı',
    hint: 'Hafta kurma: yayın, açık vardiya, uygunluk, öneri',
    panels: ['readiness', 'publish', 'openShifts', 'suitability', 'planning', 'coverage', 'deptCards'],
  },
  {
    key: 'daily',
    label: 'Günlük operasyon',
    hint: 'Bugünü yürütme: eksik kadro, gün detayı, servis/yemek bağları',
    panels: ['dayOperations', 'dayDetail', 'crossLinks', 'actionCenter', 'openShifts'],
  },
  {
    key: 'payroll',
    label: 'Puantaj kontrolörü',
    hint: 'Dönem kapatma: hazırlık, aksiyon, proje geçişleri',
    panels: ['readiness', 'actionCenter', 'crossover', 'dayDetail'],
  },
  {
    key: 'all',
    label: 'Hepsi açık',
    hint: 'Bütün paneller görünür',
    panels: SCHEDULE_PANELS.map(p => p.key),
  },
]

const TUM_ANAHTARLAR = SCHEDULE_PANELS.map(p => p.key)

export function modePanelPrefs(modeKey) {
  const mod = WORK_MODES.find(m => m.key === modeKey)
  // Bilinmeyen mod tercihleri boşaltmasın: hepsi açık en güvenli varsayılan.
  if (!mod) return Object.fromEntries(TUM_ANAHTARLAR.map(k => [k, true]))
  const acik = new Set(mod.panels)
  return Object.fromEntries(TUM_ANAHTARLAR.map(k => [k, acik.has(k)]))
}

// Elle yapılan değişiklik moddan çıkarır; hangi modda olduğunu söylemek için
// mevcut tercihi modlarla karşılaştırırız.
export function detectMode(prefs) {
  const mevcut = normalizePanelPrefs(prefs)
  const eslesen = WORK_MODES.find(m => {
    const beklenen = modePanelPrefs(m.key)
    return TUM_ANAHTARLAR.every(k => beklenen[k] === mevcut[k])
  })
  return eslesen ? eslesen.key : 'custom'
}

export function modeLabel(modeKey) {
  return WORK_MODES.find(m => m.key === modeKey)?.label || 'Özel'
}

export function loadWorkMode(storage = globalThis.localStorage) {
  try {
    const deger = storage?.getItem(KEY)
    return WORK_MODES.some(m => m.key === deger) || deger === 'custom' ? deger : null
  } catch {
    return null   // depolama kapalıysa mod hatırlanmaz, ekran çalışmaya devam eder
  }
}

export function saveWorkMode(modeKey, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, modeKey)
  } catch {
    /* kota dolu veya depolama kapalı — tercih kaydedilmez */
  }
}
