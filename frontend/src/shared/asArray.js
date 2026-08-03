// Bir uç dizi yerine başka bir şey döndüğünde ekranı çökertmesin.
//
// `data || []` ve `const { data = [] } = useQuery(...)` yalnızca undefined/null
// için çalışır. Uç bir nesne döndürürse (hata gövdesi, sayfalı sonuç, {error:…})
// değer "truthy" olduğu için varsayılan devreye girmez ve ilk `.map`/`.reduce`
// "x.map is not a function" ile sayfayı düşürür — canlıda üç ayrı ekranda oldu.
export function asArray(value) {
  if (Array.isArray(value)) return value
  // Sayfalı yanıtlar sık kullanılan iki kalıpla geliyor; onları da kurtaralım.
  if (value && Array.isArray(value.items)) return value.items
  if (value && Array.isArray(value.rows)) return value.rows
  return []
}
