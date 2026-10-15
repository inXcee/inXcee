// İmza föyü köşe işaretleri — fotoğraftan makinece okuma için (Hermes foy_okur, OpenCV ArUco).
//
// Neden QR değil: Telegram fotoğrafı ~1280 px'e sıkıştırır; A4 yatayda 1 pt ≈ 1,5 px. Güvenilir okunacak bir QR
// (≥3 px/modül) ~50 pt ister — başlık/alt bilgi bandında o yer yok, satır alanından almak "30 kişi tek sayfa"yı
// bozar. Bunun yerine dört köşe işaretinin KENDİSİ kimlik taşır: perspektif düzeltmeyi zaten bunlar yapıyor.
//
// Sözlük ArUco DICT_5X5_1000 (döndürmeler dahil en küçük Hamming ~5). 1000 kimlik dört çeyreğe bölünür; işaretin
// rolü (hangi köşe) kimlik aralığından anlaşılır:
//   sol-üst  =   0 + floor(baskıNo / 250)     baskı numarasının yüksek kısmı
//   sağ-üst  = 250 + baskıNo % 250            düşük kısmı
//   sağ-alt  = 500 + sayfa                     0 tabanlı fiziksel PDF sayfası
//   sol-alt  = 750 + sağlama(üç değer)          yanlış okumayı ve başka föyün işaretini eler
// Baskı no 1..62499, sayfa 0..249.
import { ARUCO_5X5_1000 } from './aruco5x5.js'

export const MARKER_CELLS = 7          // 5×5 desen + 1 hücre siyah kenarlık
export const MAX_PRINT_ID = 250 * 250 - 1
export const MAX_PAGE = 249

const checksum = (a, b, c) => (a * 7 + b * 13 + c * 31 + 17) % 250

export function markerIdsFor(printId, pageIndex) {
  if (!Number.isInteger(printId) || printId < 1 || printId > MAX_PRINT_ID) throw new RangeError(`baskı no 1..${MAX_PRINT_ID} olmalı`)
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > MAX_PAGE) throw new RangeError(`sayfa 0..${MAX_PAGE} olmalı`)
  const a = Math.floor(printId / 250)
  const b = printId % 250
  return { tl: a, tr: 250 + b, br: 500 + pageIndex, bl: 750 + checksum(a, b, pageIndex) }
}

// Okuyucunun bulduğu kimlikler → { printId, pageIndex } ya da null (eksik / aralık dışı / sağlama tutmuyor).
export function decodeMarkerIds({ tl, tr, br, bl } = {}) {
  const inRange = (v, lo) => Number.isInteger(v) && v >= lo && v < lo + 250
  if (!inRange(tl, 0) || !inRange(tr, 250) || !inRange(br, 500) || !inRange(bl, 750)) return null
  const a = tl, b = tr - 250, c = br - 500
  if (bl - 750 !== checksum(a, b, c)) return null
  const printId = a * 250 + b
  return printId >= 1 ? { printId, pageIndex: c } : null
}

// İşareti (x,y) sol-üst köşesinden, kenar uzunluğu `size` pt olarak çizer: önce tamamı siyah, sonra desenin
// beyaz hücreleri. Hücreler yan yana birleştirilmez — OpenCV her hücreyi ayrı örnekler, kenarlar net kalmalı.
export function drawArucoMarker(doc, id, x, y, size) {
  const code = ARUCO_5X5_1000[id]
  if (code === undefined) throw new RangeError(`ArUco kimliği 0..999 olmalı: ${id}`)
  const cell = size / MARKER_CELLS
  doc.save().fillColor('#000000').rect(x, y, size, size).fill()
  doc.fillColor('#ffffff')
  for (let r = 0; r < 5; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      const bit = (code >> (24 - (r * 5 + c))) & 1
      if (bit) doc.rect(x + (c + 1) * cell, y + (r + 1) * cell, cell, cell).fill()
    }
  }
  doc.restore()
}
