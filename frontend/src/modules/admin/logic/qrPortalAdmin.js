// Faz 6 — QR portalı yönetim ekranının saf mantığı.
//
// İki şeyi korur:
//   1. Portal, kimsenin ulaşamayacağı bir hâlde açılmasın (kapsama uyarısı).
//   2. Analitikteki sıfırlar gerekçesiyle birlikte okunsun.

export const HIZMET_ANAHTARLARI = [
  { key: 'location_portal_fault_enabled', label: 'Arıza bildirimi', desc: 'Sakin odadan arıza bildirir' },
  { key: 'location_portal_laundry_enabled', label: 'Çamaşır alma talebi', desc: 'Sakin çamaşırının alınmasını ister' },
  { key: 'location_portal_cleaning_enabled', label: 'Temizlik doğrulama', desc: 'Görevli QR ile görevi kapatır, sakin değerlendirir' },
  { key: 'location_portal_survey_enabled', label: 'Anket', desc: 'Odaya bağlı anketler' },
]

export const PIN_ANAHTARLARI = [
  { key: 'location_portal_fault_pin_required', label: 'Arıza için PIN zorunlu', bagli: 'location_portal_fault_enabled' },
  { key: 'location_portal_laundry_pin_required', label: 'Çamaşır talebi için PIN zorunlu', bagli: 'location_portal_laundry_enabled' },
  { key: 'location_portal_cleaning_review_pin_required', label: 'Temizlik değerlendirmesi için PIN zorunlu', bagli: 'location_portal_cleaning_enabled' },
]

/**
 * Portalı açmadan önce dağıtım kapsaması uyarısı.
 *
 * Etiketi kapıda olmayan bir portal, açık olsa da kimsenin ulaşamayacağı bir
 * hizmettir. Uyarı ENGELLEMEZ — yönetici etiketleri asmadan önce açmak
 * isteyebilir — ama sessizce geçmez.
 */
export function acmaUyarisi(labels) {
  if (!labels) return { seviye: 'bilinmiyor', metin: 'Etiket durumu okunamadı — kapsama doğrulanamıyor' }
  const toplam = Object.values(labels).reduce((t, v) => t + (v || 0), 0)
  if (toplam === 0) return { seviye: 'bilinmiyor', metin: 'Aktif konum yok' }

  const kanitli = (labels.installed || 0) + (labels.verified || 0)
  if (kanitli === 0) {
    return {
      seviye: 'uyari',
      metin: 'Hiçbir etiketin kapıda olduğu kayıtlı değil. Portal açılırsa QR okutabilecek kimse olmayabilir.',
    }
  }
  const oran = Math.round((kanitli / toplam) * 100)
  if (oran < 50) {
    return { seviye: 'uyari', metin: `Konumların yalnız %${oran}'inde etiket kapıda kayıtlı (${kanitli}/${toplam}).` }
  }
  return { seviye: 'ok', metin: `${kanitli}/${toplam} konumda etiket kapıda kayıtlı.` }
}

// PIN zorunluluğu, bağlı olduğu hizmet kapalıyken anlamsızdır; ekranda da
// devre dışı görünmeli yoksa "açtım ama çalışmıyor" denir.
export function pinAnahtariDurumu(ayarlar, anahtar) {
  const hizmetAcik = ayarlar?.[anahtar.bagli] === true
  return {
    disabled: !hizmetAcik,
    hint: hizmetAcik ? null : 'Bağlı hizmet kapalı — bu ayarın etkisi yok',
  }
}

/**
 * Analitikteki bir sayının okunabilir gerekçesi.
 * Sıfırın nedeni belliyse onu yazar; belli değilse "belli değil" der.
 */
export function sayiGerekcesi(service, portalEnabled) {
  if (!service) return null
  if (service.events > 0) return null
  if (!portalEnabled) return 'Portal kapalı'
  if (!service.enabled) return 'Hizmet kapalı'
  return 'Hizmet açık — kayıt yok'
}

// Sessizlik cümlesi: "342 konum hiç okutulmadı" tek başına yanıltır.
export function sessizlikOzeti(silence) {
  if (!silence) return null
  if (silence.zero_scan_locations === 0) return { seviye: 'ok', metin: 'Her konum en az bir kez okutulmuş' }
  if (!silence.measurable) {
    return {
      seviye: 'bilinmiyor',
      metin: `${silence.zero_scan_locations} konum hiç okutulmadı — ama hiçbirinin etiketi kapıda kayıtlı değil, bu bir kullanım ölçüsü değil`,
    }
  }
  return {
    seviye: silence.genuinely_unused > 0 ? 'uyari' : 'ok',
    metin: `${silence.zero_scan_locations} konum hiç okutulmadı; ${silence.explained_by_label} tanesinde etiket kapıda değil, gerçekten kullanılmayan ${silence.genuinely_unused}`,
  }
}

// Pencere ölçülemiyorsa günlük ortalama gibi türetilmiş sayı üretilmez.
export function gunlukOrtalama(window, toplam) {
  if (!window?.measurable || !window.data_from || !window.data_to) {
    return { measurable: false, reason: window?.note || 'Veri aralığı belirlenemedi' }
  }
  const gun = Math.max(1, Math.round((new Date(`${window.data_to}T00:00:00`) - new Date(`${window.data_from}T00:00:00`)) / 86400000) + 1)
  return { measurable: true, days: gun, value: Math.round(((toplam || 0) / gun) * 10) / 10 }
}
