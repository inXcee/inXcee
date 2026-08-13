// Faz 7 — QR etiket kurulum görünümünün saf mantığı.
//
// Burada tek bir şey korunuyor: "bilinmiyor" ile "kurulmadı" karışmasın.
// Arka uç ikisini ayrı döndürüyor; ekranın onları tek çubukta toplaması o
// ayrımı geri yok ederdi.

export const DURUM_SIRASI = [
  { key: 'verified', label: 'Yerinde doğrulandı', renk: '#0f766e', aciklama: 'Görevli kapının önünde okuttu' },
  { key: 'installed', label: 'Asıldı', renk: '#0284c7', aciklama: 'Asıldı denildi, yerinde okutulmadı' },
  { key: 'printed', label: 'Basıldı, asılmadı', renk: '#b45309', aciklama: 'Kâğıt çıktı, kapıya gittiği kaydedilmedi' },
  { key: 'stale', label: 'Bayat etiket', renk: '#dc2626', aciklama: 'QR yenilendi; kapıdaki kâğıt artık çalışmıyor' },
  { key: 'damaged', label: 'Hasarlı', renk: '#dc2626', aciklama: 'Yırtık, sökülmüş, okunmuyor' },
  { key: 'removed', label: 'Kaldırılmış', renk: '#64748b', aciklama: 'Etiket sökülmüş' },
  { key: 'qr_missing', label: 'QR üretilmemiş', renk: '#7c3aed', aciklama: 'Konumun aktif QR kodu yok' },
  { key: 'unknown', label: 'Durum bilinmiyor', renk: '#94a3b8', aciklama: 'Fiziksel durum hiç kaydedilmemiş — kurulmadı DEMEK DEĞİL' },
]

export function durumKovalari(summary) {
  if (!summary) return []
  return DURUM_SIRASI
    .map(d => ({ ...d, adet: summary[d.key] || 0 }))
    .filter(d => d.adet > 0)
}

/**
 * Kurulum oranı. Paydası yalnız durumu BİLİNEN konumlardır.
 *
 * Bilinmeyeni paydaya katmak oranı sahte düşürür ("kurulum %30'da kalmış"),
 * paya katmak sahte yükseltir ("her şey tamam"). İkisi de yanlış karar
 * verdirir; o yüzden ölçülemiyorsa yüzde HİÇ gösterilmez.
 */
export function kurulumOrani(summary) {
  if (!summary) return { measurable: false, reason: 'Rapor okunamadı' }
  const bilinen = summary.known ?? 0
  if (bilinen <= 0) {
    return {
      measurable: false,
      reason: summary.total > 0
        ? 'Hiçbir konumun etiket durumu kaydedilmemiş — oran hesaplanamaz'
        : 'Aktif konum yok',
    }
  }
  const yerinde = (summary.verified || 0) + (summary.installed || 0)
  return {
    measurable: true,
    percent: Math.round((yerinde / bilinen) * 100),
    numerator: yerinde,
    denominator: bilinen,
    // Payda ekranda da yazılır: "%80 (16/20 bilinen konum)".
    label: `${Math.round((yerinde / bilinen) * 100)}% (${yerinde}/${bilinen} bilinen konum)`,
  }
}

// Sahada gidip yapılacak iş listesi. "Bilinmiyor" buraya GİRMEZ: gidip
// asılacak bir şey yok, yalnız kayıt eksik.
export function aksiyonGerekenler(items = []) {
  return items.filter(i => i.actionable)
}

// Basım partisi özeti — kaç etiketi bayatladı, yeniden basım gerekiyor mu.
export function partiDurumu(batch) {
  if (!batch) return null
  const bayat = batch.stale_labels || 0
  if (batch.status === 'cancelled') return { renk: '#94a3b8', metin: 'İptal edildi' }
  if (bayat > 0) return { renk: '#dc2626', metin: `${bayat} etiketin QR'ı değişti — yeniden basılmalı` }
  if (batch.status === 'printed') return { renk: '#0f766e', metin: 'Basıldığı onaylandı' }
  return { renk: '#b45309', metin: 'PDF alındı, basıldığı onaylanmadı' }
}

export function tahminiSayfa(adet, perPage) {
  if (!adet || !perPage) return 0
  return Math.ceil(adet / perPage)
}
