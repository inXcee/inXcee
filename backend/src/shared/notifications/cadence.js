// Çözülmeyen bir uyarı ne sıklıkla tekrar edilmeli?
//
// Eskiden bazı uyarılar dedup anahtarına SAAT kovası koyuyordu; sonuç, aynı
// sorun için saatte bir bildirim ve aylarca süren tekrar oldu (canlıda tek bir
// torba için 1431 kopya). Zil böyle kullanılamaz hale geliyor ve gerçek uyarılar
// yığının altında kayboluyor.
//
// Kural: sorun tazeyken günde bir hatırlat. 72 saati aşınca kronikleşmiştir —
// artık "bugün ilgilenilecek bir haber" değildir, SLA ekranında zaten görünür.
// O noktadan sonra haftada bire düşeriz; tamamen susmayız.
const KRONIK_ESIGI_SAAT = 72

function gunKovasi(now) {
  return `d${now.toISOString().slice(0, 10)}`
}

function haftaKovasi(now) {
  // Epoch'tan bu yana geçen hafta sayısı — takvim haftasına gerek yok, tek
  // ihtiyacımız 7 gün boyunca sabit kalan bir değer.
  return `w${Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))}`
}

// createNotification({ dedup_lookback_days }) ile birlikte kullanılır: bildirim tekrar kontrolü kovanın ömrü
// kadar geriye bakmalı. Varsayılan "aynı gün" kontrolüyle haftalık kova her gün yeniden bildirim doğuruyordu
// (canlıda rafta unutulan tek ürün için 72 günde 74 "SLA KRİTİK"). Günlük kova anahtarı zaten güne özgüdür.
export const ALERT_BUCKET_LOOKBACK_DAYS = 7

export function alertBucket(ageHours, now = new Date()) {
  if (ageHours != null && ageHours >= KRONIK_ESIGI_SAAT) return haftaKovasi(now)
  return gunKovasi(now)
}
