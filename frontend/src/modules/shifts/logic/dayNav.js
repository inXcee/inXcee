// Gün detayında gün değiştirme mantığı.
//
// Kullanıcı gün gün "kim hangi vardiyada" listesine bakarken günü hızlı
// değiştirmek istiyor. Gün seçici panelin içinde kaldığı ve üstünde analiz
// blokları olduğu için listeye inince ekrandan çıkıyordu; yapışkan (sticky)
// çözüm de kapsayıcı sınırlarına takılıyor. Bu yüzden gezinme mantığı
// bileşenden ayrıldı: hem yüzen çubuk hem klavye aynı kaynağı kullanır.

// Haftanın günleri arasında ilerler. Hafta sonunda DURUR — sarmalasaydı
// "ileri" tuşuna basan kişi farkında olmadan pazartesiye dönerdi.
export function stepDay(days, current, delta) {
  const liste = Array.isArray(days) ? days : []
  if (liste.length === 0) return current
  const simdi = liste.indexOf(current)
  if (simdi === -1) return liste[0]
  const hedef = simdi + delta
  if (hedef < 0 || hedef >= liste.length) return current
  return liste[hedef]
}

export function canStep(days, current, delta) {
  return stepDay(days, current, delta) !== current
}

// Klavye: sadece sade ok tuşları. Ctrl/Alt/Meta basılıysa ya da odak bir yazı
// alanındaysa karışmaz — arama kutusunda gezinirken gün değişmemeli.
export function dayKeyDelta(event, activeElement) {
  if (!event || event.ctrlKey || event.altKey || event.metaKey) return 0
  const etiket = (activeElement?.tagName || '').toLowerCase()
  if (etiket === 'input' || etiket === 'textarea' || etiket === 'select') return 0
  if (activeElement?.isContentEditable) return 0
  if (event.key === 'ArrowLeft') return -1
  if (event.key === 'ArrowRight') return 1
  return 0
}
