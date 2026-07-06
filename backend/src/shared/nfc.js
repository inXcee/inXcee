// NFC UID normalizasyonu — telefon (Web NFC serialNumber, ör. "04:1a:2b") ve
// sabit USB okuyucu çıktısı aynı kanonik forma ("041A2B") gelsin; böylece
// telefonla kaydedilen kart istasyonda da eşleşir.
export function normalizeNfcUid(raw) {
  const v = String(raw ?? '').trim().toUpperCase().replace(/[\s:.\-]/g, '')
  return v || null
}
