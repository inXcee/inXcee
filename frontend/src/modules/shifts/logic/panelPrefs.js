// Çizelgenin altındaki yardımcı paneller (kapsama, gün detayı, proje geçişleri,
// bölüm kartları) herkese lazım değil: kimi sadece çizelgeyi görmek istiyor ve
// bu bloklar hem ekranı doldurup asıl tabloyu aşağı itiyor hem her hafta
// değişiminde kendi isteklerini atıyor. Burada hangisinin açık olduğu tutulur.
//
// Kapalı panel HİÇ render edilmez — sadece görsel gizleme olsaydı isteği yine
// gidecek, sayfa yine yavaşlayacaktı.

const KEY = 'shifts.schedulePanels.v1'

export const SCHEDULE_PANELS = [
  { key: 'readiness', label: 'Hazırlık durumu', hint: 'Ana veriler ve kurallar yerinde mi' },
  { key: 'publish', label: 'Yayın durumu', hint: 'Hafta taslak mı, yayında mı; yayından beri değişenler' },
  { key: 'actionCenter', label: 'Aksiyon merkezi', hint: 'Onay bekleyen, çakışan, eksik — tek listede' },
  { key: 'dayOperations', label: 'Günlük operasyon', hint: 'Eksik kadro, yerine çağrılabilecekler, devir teslim' },
  { key: 'openShifts', label: 'Açık vardiyalar', hint: 'İlan, başvuru ve aday uygunluğu' },
  { key: 'suitability', label: 'Uygunluk matrisi', hint: 'Bu vardiyaya kimleri koyabilirim' },
  { key: 'deptCards', label: 'Bölüm kartları', hint: 'Bölüm bölüm kişi ve durum sayıları' },
  { key: 'coverage', label: 'Kapsama / kadro hedefi', hint: 'Hedef-gerçekleşen ve departman kırılımı' },
  { key: 'dayDetail', label: 'Gün detayı', hint: 'Gün gün kim hangi vardiyada, nerede' },
  { key: 'crossover', label: 'Proje geçişleri', hint: 'FPU ↔ Kamp Alanı arası çalışanlar' },
]

const TUM_ANAHTARLAR = SCHEDULE_PANELS.map(p => p.key)

// Varsayılan: hepsi açık — mevcut davranış korunur, kullanıcı isterse kapatır.
export function defaultPanelPrefs() {
  return Object.fromEntries(TUM_ANAHTARLAR.map(k => [k, true]))
}

// Bilinmeyen anahtarlar atılır, eksikler varsayılana düşer: eski bir kayıt ya da
// elle bozulmuş depolama yüzünden panel kaybolmasın.
export function normalizePanelPrefs(value) {
  const varsayilan = defaultPanelPrefs()
  if (!value || typeof value !== 'object') return varsayilan
  return Object.fromEntries(TUM_ANAHTARLAR.map(k => [k, typeof value[k] === 'boolean' ? value[k] : varsayilan[k]]))
}

export function togglePanel(prefs, key) {
  if (!TUM_ANAHTARLAR.includes(key)) return normalizePanelPrefs(prefs)
  const mevcut = normalizePanelPrefs(prefs)
  return { ...mevcut, [key]: !mevcut[key] }
}

export function setAllPanels(open) {
  return Object.fromEntries(TUM_ANAHTARLAR.map(k => [k, !!open]))
}

export function hiddenPanelCount(prefs) {
  const mevcut = normalizePanelPrefs(prefs)
  return TUM_ANAHTARLAR.filter(k => !mevcut[k]).length
}

export function loadPanelPrefs(storage = globalThis.localStorage) {
  try {
    return normalizePanelPrefs(JSON.parse(storage?.getItem(KEY) || 'null'))
  } catch {
    return defaultPanelPrefs()   // bozuk kayıt paneli yok etmesin
  }
}

export function savePanelPrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(normalizePanelPrefs(prefs)))
  } catch {
    /* kota dolu veya depolama kapalı — tercih kaydedilmez, ekran çalışmaya devam eder */
  }
}
