// Personel Takip Merkezi dört ayrı sorgu çalıştırıyor. Herhangi biri düşünce
// ekran tek bir cümle yazıyordu: "Takip verilerinin bir bölümü alınamadı.
// Bağlantıyı kontrol edip Yenile ile tekrar deneyin."
//
// O cümle iki şeyi gizliyordu: HANGİ bölüm ve NEDEN. 2026-08-09'da sebep
// bağlantı değildi — sunucudaki şema geride kalmıştı (takip tabloları yoktu).
// Kullanıcı bağlantısını kontrol edip durdu, gerçek sebep ancak sunucuya
// girilerek bulunabildi. Artık hangi bölümün düştüğü ve sunucunun ne dediği
// yazılıyor.

// Axios hatasından okunabilir sebep çıkarır.
export function failureReason(error) {
  if (!error) return { kind: 'unknown', status: null, message: 'Bilinmeyen hata' }
  const status = error.response?.status ?? null
  const serverMessage = error.response?.data?.error || error.response?.data?.message

  if (!error.response) {
    return { kind: 'network', status: null, message: 'Sunucuya ulaşılamadı (bağlantı veya sunucu kapalı)' }
  }
  if (status === 401) return { kind: 'auth', status, message: 'Oturum düşmüş — yeniden giriş yapın' }
  if (status === 403) return { kind: 'forbidden', status, message: 'Bu bölüm için yetkiniz yok' }
  if (status === 404) return { kind: 'missing', status, message: 'Uç bulunamadı (sunucu sürümü eski olabilir)' }
  if (status >= 500) {
    return { kind: 'server', status, message: serverMessage || 'Sunucu hatası' }
  }
  return { kind: 'request', status, message: serverMessage || error.message || 'İstek reddedildi' }
}

// sections: [{ label, query }] — query React Query nesnesi.
// Hata yoksa null döner ki çağıran hiçbir şey çizmesin.
export function describeTrackingErrors(sections = []) {
  const basarisiz = sections
    .filter(section => section?.query?.isError)
    .map(section => ({ label: section.label, ...failureReason(section.query.error) }))

  if (basarisiz.length === 0) return null

  const etiketler = basarisiz.map(item => item.label)
  // Aynı sebep tekrar tekrar yazılmasın; farklıysa hepsi görünsün.
  const sebepler = [...new Set(basarisiz.map(item => (
    item.status ? `${item.message} (HTTP ${item.status})` : item.message
  )))]

  return {
    labels: etiketler,
    reasons: sebepler,
    // Yetki ve oturum sorununda "bağlantıyı kontrol edin" demek yanlış yönlendirir.
    retryable: basarisiz.some(item => item.kind === 'network' || item.kind === 'server'),
    text: `${etiketler.join(', ')} alınamadı — ${sebepler.join(' · ')}`,
  }
}
