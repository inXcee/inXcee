// Ütü politikası — backend `laundry_garment_types.ironing_policy` (migration 072)
// ile aynı kural. Eskiden tür bazlı 0/1 vardı ve 0, "bilinçli olarak ütülenmez"
// ile "hiç belirtilmemiş"i ayırmıyordu; kiosk her ikisinde de sessizce
// "Ütü gerekmiyor" seçiyordu. Artık yalnızca 'never' ütüyü kapatır.
export const IRONING_ALWAYS = 'always'
export const IRONING_NEVER = 'never'
export const IRONING_ASK = 'ask'

export function policyOf(type) {
  if (!type) return IRONING_ASK
  if (type.ironing_policy) return type.ironing_policy
  // Politika kolonu gelmeyen eski yanıt: 1 → always, 0 → belirtilmemiş say
  return type.default_requires_ironing ? IRONING_ALWAYS : IRONING_ASK
}

// Varsayılan ütü durumu. Belirtilmemiş ('ask') türde AÇIK gelir —
// eksik ütü, fazladan ütüden daha kötü bir hata.
export function ironingDefaultFor(type) {
  return policyOf(type) !== IRONING_NEVER
}

// Operatörün gözden geçirmesi gereken parça mı? ('ask' = tür ayarı yapılmamış)
export function needsIroningReview(type) {
  return policyOf(type) === IRONING_ASK
}

export const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
