// Faz 7 — Etiket şablonları ve vektörel QR çizimi.
//
// İlk sürüm QR'ı 320 px PNG olarak basıyordu. Bu, kendinden yapışkanlı etikete
// 45 mm boyunda basılınca ~180 DPI'a denk gelir; lazer baskıda modül kenarları
// yumuşar ve düşük ışıkta okuma zorlaşır. Burada QR PDF'e VEKTÖREL çiziliyor:
// her modül bir dolu dikdörtgen, büyütmede bozulma yok.
//
// Ölçüler milimetre cinsinden tanımlı; PDF nokta (pt) ile çalıştığı için tek
// bir yerde çevriliyor. "Sayfaya sığdır" olmadan gerçek boyut basılabilmesi
// bunun doğru olmasına bağlı.

// 1 mm = 72/25.4 pt. Etiket ölçüsü milimetre, PDF nokta — dönüşüm tek yerde.
export const MM = 72 / 25.4

export const A4_MM = { w: 210, h: 297 }

// Piyasadaki standart kendinden yapışkanlı A4 etiket ölçüleri.
export const TEMPLATES = {
  // Varsayılan: A4 8'li (2×4), 99,1 × 67,7 mm
  a4_8: {
    key: 'a4_8',
    label: 'A4 8’li etiket (99,1 × 67,7 mm)',
    page: A4_MM,
    cols: 2,
    rows: 4,
    labelW: 99.1,
    labelH: 67.7,
    marginX: 4.65,
    marginY: 13.05,
    gapX: 2.5,
    gapY: 0,
    qrMm: 45,        // spec: büyük etikette 44-46 mm
    titleSize: 15,
    bodySize: 8,
  },
  // A4 12'li kompakt (3×4), 63,5 × 72 mm
  a4_12: {
    key: 'a4_12',
    label: 'A4 12’li kompakt etiket (63,5 × 72 mm)',
    page: A4_MM,
    cols: 3,
    rows: 4,
    labelW: 63.5,
    labelH: 72,
    // 3×63,5 + 2×2,5 = 195,5 mm; kalan 14,5 mm iki kenara bölünür. 7,75
    // yazılırsa toplam 211 mm olur ve sağdaki sütun sayfadan taşar.
    marginX: 7.25,
    marginY: 4.5,
    gapX: 2.5,
    gapY: 0,
    qrMm: 37,        // spec: kompaktta en az 36 mm
    titleSize: 12,
    bodySize: 7,
  },
  // Tekli kapı etiketi / termal yazıcı: 100 × 70 mm, sayfa = etiket
  tek_100x70: {
    key: 'tek_100x70',
    label: 'Tekli kapı etiketi (100 × 70 mm)',
    page: { w: 100, h: 70 },
    cols: 1,
    rows: 1,
    labelW: 100,
    labelH: 70,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
    qrMm: 45,
    titleSize: 15,
    bodySize: 8,
  },
}

export const DEFAULT_TEMPLATE = 'a4_8'

export function getTemplate(key) {
  return TEMPLATES[key] || TEMPLATES[DEFAULT_TEMPLATE]
}

export function labelsPerPage(tpl) {
  return tpl.cols * tpl.rows
}

// Kalibrasyon: yazıcılar birkaç milimetre kayar. Ölçek güvenli aralıkta tutulur
// — %98'in altı QR'ı okunamaz hâle getirebilir, %102'nin üstü etiketi taşırır.
export function normalizeCalibration(cal = {}) {
  const sayi = (v, varsayilan) => (Number.isFinite(Number(v)) ? Number(v) : varsayilan)
  const offsetX = Math.max(-10, Math.min(10, sayi(cal.offset_x_mm, 0)))
  const offsetY = Math.max(-10, Math.min(10, sayi(cal.offset_y_mm, 0)))
  const scale = Math.max(0.98, Math.min(1.02, sayi(cal.scale, 1)))
  return { offset_x_mm: offsetX, offset_y_mm: offsetY, scale }
}

// İnsan tarafından okunabilir kısa seri: RQ-M1-101-A7K3
// Token BASILMAZ; bu seri yalnız "hangi etiket" demek için, tek başına
// portala erişim vermez.
export function shortSerial(location, token) {
  const blok = String(location.block || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'XX'
  const oda = String(location.room_no || location.area_code || location.location_id || '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || '0'
  // Token'ın kendisinden türetilmiş 4 karakter: aynı etiket her basımda aynı
  // seriyi alır, ama seriden token geri üretilemez.
  let h = 0
  for (const ch of String(token || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const alfabe = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // I,O,0,1 yok — elle okunurken karışır
  let kuyruk = ''
  for (let i = 0; i < 4; i += 1) {
    kuyruk += alfabe[h % alfabe.length]
    h = Math.floor(h / alfabe.length) + 7
  }
  return `RQ-${blok}-${oda}-${kuyruk}`
}

/**
 * QR'ı PDF'e VEKTÖREL çizer: her modül bir dikdörtgen.
 * PNG gömmek yerine bunu yapmak, etiketi büyütünce bozulmayı ve düşük DPI'da
 * yumuşamayı ortadan kaldırır.
 *
 * @param doc     pdfkit belgesi
 * @param qr      QRCode.create(...) sonucu
 * @param x,y,size  pt cinsinden sol-üst köşe ve kenar uzunluğu
 */
export function drawVectorQr(doc, qr, x, y, size) {
  const adet = qr.modules.size
  const veri = qr.modules.data
  // Spec: QR etrafında en az 4 modüllük sessiz alan. Sessiz alanı çizim
  // alanının İÇİNDEN ayırıyoruz ki etiket yerleşimi kaymasın.
  const sessiz = 4
  const toplam = adet + sessiz * 2
  const modul = size / toplam
  const bas = { x: x + sessiz * modul, y: y + sessiz * modul }

  doc.save().fillColor('#000000')
  for (let satir = 0; satir < adet; satir += 1) {
    let sutun = 0
    while (sutun < adet) {
      if (!veri[satir * adet + sutun]) { sutun += 1; continue }
      // Yan yana dolu modülleri tek dikdörtgende birleştir: PDF hem küçülür
      // hem de modüller arasında saç teli boşluk kalmaz.
      let uzunluk = 1
      while (sutun + uzunluk < adet && veri[satir * adet + sutun + uzunluk]) uzunluk += 1
      doc.rect(bas.x + sutun * modul, bas.y + satir * modul, modul * uzunluk, modul).fill()
      sutun += uzunluk
    }
  }
  doc.restore()
}

// Ortak alan etiketi farklı başlık rengiyle basılır ve çamaşır ikonu içermez.
export function labelTheme(locationType) {
  return locationType === 'room'
    ? { accent: '#0f766e', title: 'Oda Hizmetleri', showLaundry: true }
    : { accent: '#b45309', title: 'Ortak Alan Hizmetleri', showLaundry: false }
}

// Uzun blok/oda adları küçültülür ama okunamaz hâle gelmez.
export function fitFontSize(doc, text, maxWidth, startSize, minSize) {
  let size = startSize
  while (size > minSize) {
    doc.fontSize(size)
    if (doc.widthOfString(String(text || '')) <= maxWidth) break
    size -= 0.5
  }
  return Math.max(minSize, size)
}
