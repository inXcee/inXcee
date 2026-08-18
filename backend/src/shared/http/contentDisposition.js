// Content-Disposition başlığını GÜVENLİ üretir.
//
// Somut bir canlı hatadan doğdu: `/api/reports/housekeeping` her çağrıda 500
// dönüyordu. Sebep, başlıkta uzun tire (—) geçen bir dosya adıydı:
//
//   res.setHeader('Content-Disposition', `attachment; filename="Rapor — 2026-08-17.pdf"`)
//   → TypeError: Invalid character in header content
//
// HTTP başlıkları Latin-1 dışına çıkamaz. Türkçe bir oda adı (Çamaşırhane),
// bir uzun tire ya da kullanıcının yazdığı herhangi bir metin dosya adına
// karışırsa uç 500 döner — ve bu YEREL TESTTE görünür, ama yalnız o adı
// üreten veri varsa. Bu yüzden ad değil, ÜRETİM YOLU düzeltildi.
//
// Çözüm iki parçalı (RFC 6266):
//   filename="..."           → ASCII yedek, her istemci anlar
//   filename*=UTF-8''...     → gerçek ad, modern tarayıcılar bunu tercih eder

const TR_HARITA = {
  ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I',
  ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
}

/**
 * ASCII yedek ad. Türkçe harfler okunabilir karşılıklarına çevrilir
 * (Çamaşır → Camasir), kalan ASCII dışı karakterler tireye iner.
 */
export function asciiFilename(name, fallback = 'dosya') {
  const ham = String(name ?? '').trim()
  if (!ham) return fallback
  const cevrilmis = ham
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => TR_HARITA[ch])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // kalan aksanları ayıkla
    .replace(/[^\x20-\x7E]/g, '-')                       // Latin-1 dışı → tire
    .replace(/["\\\r\n]/g, '-')                          // başlığı bozacak karakterler
    .replace(/-{2,}/g, '-')
    .replace(/^[-\s]+|[-\s]+$/g, '')
  return cevrilmis || fallback
}

/**
 * `attachment; filename="..."; filename*=UTF-8''...`
 *
 * @param name      Gerçek dosya adı (Türkçe olabilir)
 * @param fallback  Ad tamamen elenirse kullanılacak ASCII ad
 */
export function attachmentDisposition(name, fallback = 'dosya') {
  const ascii = asciiFilename(name, fallback)
  const utf8 = encodeURIComponent(String(name ?? '').trim() || fallback)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

/**
 * Başlığı doğrudan yanıta yazar. Çağıranın kaçırmayı unutması bu yolla
 * imkânsız hâle gelir.
 */
export function setAttachment(res, name, fallback = 'dosya') {
  res.setHeader('Content-Disposition', attachmentDisposition(name, fallback))
}
