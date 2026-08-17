// Saha dağıtımı — koridoru gezen görevlinin mantığı.
//
// Faz 7 dürüst bir ölçüm kurdu: kurulum kaydı olmayan konum "kurulmadı" değil
// "bilinmiyor". Ama bilinmeyeni ÇÖZMENİN yolunu bırakmadı — kampüsteki 1078
// konum "bilinmiyor" kovasında donup kaldı ve kapsama oranı hep "ölçülemiyor"
// dedi. Bu dosya o boşluğu kapatır: sahada tek tek okutup gerçeği kaydetmek.

// Kuyruk sırası: en belirsizden en kesine değil, EN ÇOK İŞ GEREKTİRENDEN
// başlar. Bayat etiket sökülüp yenisi asılmalı; hiç bilinmeyen yalnız
// doğrulanmalı — ikisi aynı aciliyette değil.
export const ONCELIK = {
  stale: 0,       // kapıdaki kâğıt ölü, yeniden basılmalı
  damaged: 1,
  qr_missing: 2,  // önce QR üretilmeli
  printed: 3,     // basıldı, asıldığı kaydedilmedi
  removed: 4,
  unknown: 5,     // durumu hiç kaydedilmemiş — yalnız doğrulanacak
  installed: 6,   // asıldı, yerinde doğrulanmadı
  verified: 7,    // iş yok
}

export const BITMIS = new Set(['verified'])

/**
 * Sahada gezilecek kuyruk. Bitmiş konumlar dışarıda kalır; kalanlar önce
 * önceliğe, sonra fiziksel gezme sırasına (kat, sonra ad) dizilir.
 *
 * Fiziksel sıra önemli: görevli koridoru bir kez yürüyor, uygulamanın onu
 * kat kat ileri geri göndermesi işi uzatır.
 */
export function sahaKuyrugu(items = [], { block = null, floor = null } = {}) {
  return items
    .filter(i => !BITMIS.has(i.state))
    .filter(i => (block ? i.block === block : true))
    .filter(i => (floor ? String(i.floor) === String(floor) : true))
    .sort((a, b) => (
      (ONCELIK[a.state] ?? 9) - (ONCELIK[b.state] ?? 9)
      || (a.floor ?? 0) - (b.floor ?? 0)
      || String(a.display_name).localeCompare(String(b.display_name), 'tr')
    ))
}

// İlerleme: paydası kapsamdaki TÜM konum, payı doğrulanmışlar. "Bilinmiyor"
// paya da paydaya da ayrıca yazılır ki oran şişmesin.
export function sahaIlerleme(items = [], { block = null, floor = null } = {}) {
  const kapsam = items
    .filter(i => (block ? i.block === block : true))
    .filter(i => (floor ? String(i.floor) === String(floor) : true))
  if (!kapsam.length) return { measurable: false, reason: 'Bu kapsamda konum yok' }
  const biten = kapsam.filter(i => BITMIS.has(i.state)).length
  return {
    measurable: true,
    done: biten,
    total: kapsam.length,
    unknown: kapsam.filter(i => i.state === 'unknown').length,
    percent: Math.round((biten / kapsam.length) * 100),
    label: `${biten}/${kapsam.length} doğrulandı`,
  }
}

/**
 * Sunucunun doğrulama yanıtını sahadaki kişinin anlayacağı tek cümleye çevirir.
 *
 * Kritik ayrım: "yanlış kapı" bir HATA DEĞİL, bir BULGUDUR — görevli yanlış
 * bir şey yapmadı, etiket yanlış yere asılmış. Mesaj onu suçlar gibi
 * okunmamalı, ne yapacağını söylemeli.
 */
export function taramaSonucu(yanit, beklenen) {
  if (!yanit) return { tur: 'hata', baslik: 'Yanıt alınamadı', detay: 'Bağlantıyı kontrol edip tekrar deneyin', ilerle: false }

  if (yanit.ok) {
    return {
      tur: 'basari',
      baslik: `${yanit.scanned?.display_name || 'Konum'} doğrulandı`,
      detay: 'Sıradaki konuma geçebilirsiniz',
      ilerle: true,
    }
  }
  if (yanit.code === 'location_mismatch') {
    return {
      tur: 'uyusmazlik',
      baslik: 'Yanlış kapıda etiket',
      detay: `Burada ${beklenen?.display_name || 'beklenen konum'} olmalıydı; okuttuğunuz etiket ${yanit.scanned?.display_name || 'başka bir konuma'} ait. Etiketleri yer değiştirin, sonra tekrar okutun.`,
      ilerle: false,
    }
  }
  if (yanit.code === 'qr_revoked') {
    return {
      tur: 'bayat',
      baslik: 'Etiket geçersiz',
      detay: `Bu etiketteki QR iptal edilmiş${yanit.scanned?.display_name ? ` (${yanit.scanned.display_name})` : ''}. Sökün, yerine yeni basılan etiketi asın.`,
      ilerle: false,
    }
  }
  if (yanit.code === 'qr_unknown') {
    return {
      tur: 'taninmiyor',
      baslik: 'Tanınmayan QR',
      detay: 'Bu kod sistemde yok — başka bir kurulumdan kalmış olabilir. Sökün ve yöneticiye bildirin.',
      ilerle: false,
    }
  }
  return { tur: 'hata', baslik: 'Doğrulanamadı', detay: yanit.message || yanit.error || 'Bilinmeyen hata', ilerle: false }
}

// Okutulan metinden token ayıklama. Telefon kamerası tam URL verir.
export function tokenAyikla(okunan) {
  const t = String(okunan || '').trim()
  if (!t) return null
  const parca = t.includes('/') ? t.split(/[?#]/)[0].split('/').filter(Boolean).pop() : t
  return parca && parca.length >= 20 ? parca : null
}

// Elle "astım" demek, doğrulamanın yerini TUTMAZ. Ayrı bir güven seviyesidir
// ve ekranda da öyle görünmelidir.
export function elleIsaretUyarisi(state) {
  if (state === 'unknown') {
    return 'Okutmadan işaretlerseniz "asıldı" olarak kaydedilir — yerinde doğrulanmış sayılmaz.'
  }
  if (state === 'stale') {
    return 'Bu etiketin QR’ı geçersiz. Elle "asıldı" demek onu çalışır hâle getirmez; yeni etiket basılmalı.'
  }
  return 'Okutarak doğrulamak daha güvenilirdir; elle işaret yalnız kamera çalışmadığında kullanılmalı.'
}
