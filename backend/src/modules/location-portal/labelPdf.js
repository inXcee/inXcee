import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { registerTurkishFonts, pdfText } from '../../shared/pdf/fonts.js'
import {
  MM, getTemplate, labelsPerPage, normalizeCalibration,
  shortSerial, drawVectorQr, labelTheme, fitFontSize,
} from './labelTemplates.js'

// Faz 7 — Profesyonel etiket basımı.
//
// İlk sürüm A4'e 3×4 keyfi kutu koyup QR'ı PNG olarak gömüyordu. Kesip
// yapıştırmak için idare ederdi ama kendinden yapışkanlı etiket kâğıdına
// basılamazdı: ölçüler standart etiketle tutmuyordu ve QR rasterdi.
//
// Buradaki üç fark fiziksel sonucu değiştiriyor:
//   • Ölçüler MİLİMETRE ve gerçek etiket standardına göre (99,1 × 67,7 mm)
//   • QR vektörel çiziliyor — büyütmede bozulma yok
//   • Hata düzeltme 'H' (spec) — etiket yıpransa da okunur
//
// PDF akış halinde üretiliyor: 1078 etiket tek buffer'da toplanırsa bellek
// şişer. Çağıran stream'i doğrudan HTTP cevabına bağlayabilir.

const RENK = { metin: '#111111', soluk: '#555555', cizgi: '#d0d0d0' }

// Spec: QR daima siyah-beyaz ve logosuz; renk yalnız başlık ve ikonlarda.
function qrMatrisi(url) {
  return QRCode.create(url, { errorCorrectionLevel: 'H' })
}

export function portalUrl(baseUrl, token) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/r/${token}`
}

/**
 * Tek etiketi verilen hücreye çizer.
 * x,y,w,h pt cinsindendir; şablon ölçüleri mm'den çevrilmiş olarak gelir.
 */
export function drawLabel(doc, fonts, konum, { x, y, w, h, tpl, baseUrl, cut = true }) {
  const tema = labelTheme(konum.location_type)
  const url = portalUrl(baseUrl, konum.token)
  const seri = shortSerial(konum, konum.token)

  if (cut) {
    doc.save().lineWidth(0.4).strokeColor(RENK.cizgi)
      .rect(x, y, w, h).dash(2, { space: 2 }).stroke().undash().restore()
  }

  const ic = 4 * MM
  const qrBoy = tpl.qrMm * MM
  const qrX = x + ic
  const qrY = y + (h - qrBoy) / 2

  drawVectorQr(doc, qrMatrisi(url), qrX, qrY, qrBoy)

  // Metin sütunu QR'ın sağında.
  const metinX = qrX + qrBoy + 3 * MM
  const metinW = x + w - ic - metinX
  let ty = y + ic + 1 * MM

  // Başlık şeridi: ortak alanda farklı renk.
  doc.save().fillColor(tema.accent).rect(metinX, ty, metinW, 1.2 * MM).fill().restore()
  ty += 3 * MM

  // Blok + oda numarası, en belirgin öğe: yanlış kapıya yapıştırılan etiket
  // uzaktan bakınca fark edilsin.
  doc.font(fonts.bold).fillColor(RENK.metin)
  const baslikPunto = fitFontSize(doc, konum.display_name, metinW, tpl.titleSize, 7)
  doc.fontSize(baslikPunto)
  doc.text(pdfText(konum.display_name || 'Konum', fonts), metinX, ty, {
    width: metinW, lineBreak: false, ellipsis: true,
  })
  ty += baslikPunto + 2 * MM

  doc.font(fonts.regular).fontSize(tpl.bodySize).fillColor(tema.accent)
  doc.text(pdfText(tema.title, fonts), metinX, ty, { width: metinW, lineBreak: false, ellipsis: true })
  ty += tpl.bodySize + 1.5 * MM

  // Üç dilde tek satır yönlendirme.
  doc.font(fonts.regular).fontSize(tpl.bodySize).fillColor(RENK.metin)
  doc.text(pdfText('Tara / Scan / امسح', fonts), metinX, ty, { width: metinW, lineBreak: false })
  ty += tpl.bodySize + 1.2 * MM

  // Hizmet listesi — ortak alanda çamaşır yok.
  const hizmetler = ['Arıza', 'Temizlik', 'Anket']
  if (tema.showLaundry) hizmetler.splice(1, 0, 'Çamaşır')
  doc.font(fonts.regular).fontSize(tpl.bodySize - 1).fillColor(RENK.soluk)
  doc.text(pdfText(hizmetler.join(' · '), fonts), metinX, ty, { width: metinW, lineBreak: false, ellipsis: true })

  // Alt satır: kısa seri + destek. Token BASILMAZ.
  const altY = y + h - ic - (tpl.bodySize - 1)
  doc.font(fonts.regular).fontSize(tpl.bodySize - 1.5).fillColor(RENK.soluk)
  doc.text(pdfText(seri, fonts), metinX, altY - (tpl.bodySize + 1), { width: metinW, lineBreak: false })
  doc.text(pdfText('Sorun olursa görevliye bildirin', fonts), metinX, altY, {
    width: metinW, lineBreak: false, ellipsis: true,
  })

  return seri
}

function kapakSayfasi(doc, fonts, { tpl, adet, sayfa, batchNo, filtre }) {
  const sol = 20 * MM
  let y = 25 * MM
  doc.font(fonts.bold).fontSize(18).fillColor(RENK.metin)
  doc.text(pdfText('QR ETİKET BASIM FÖYÜ', fonts), sol, y)
  y += 12 * MM

  const satirlar = [
    ['Parti', batchNo || '—'],
    ['Şablon', tpl.label],
    ['Etiket sayısı', String(adet)],
    ['Etiket sayfası', String(sayfa)],
    ['Filtre', Object.entries(filtre || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || 'tüm kampüs'],
  ]
  doc.fontSize(10)
  for (const [ad, deger] of satirlar) {
    doc.font(fonts.bold).fillColor(RENK.soluk)
    doc.text(pdfText(ad, fonts), sol, y, { width: 40 * MM, lineBreak: false })
    doc.font(fonts.regular).fillColor(RENK.metin)
    doc.text(pdfText(deger, fonts), sol + 42 * MM, y, { width: 120 * MM, lineBreak: false, ellipsis: true })
    y += 7 * MM
  }

  y += 6 * MM
  doc.font(fonts.bold).fontSize(11).fillColor(RENK.metin)
  doc.text(pdfText('Yazdırma ayarı', fonts), sol, y)
  y += 7 * MM
  doc.font(fonts.regular).fontSize(9.5).fillColor(RENK.metin)
  // Bu uyarı olmadan yazıcı "sayfaya sığdır" yapar ve etiketler kayar.
  for (const satir of [
    'Ölçek: GERÇEK BOYUT / %100 — "sayfaya sığdır" KAPALI olmalı.',
    'Kâğıt: A4, kendinden yapışkanlı etiket.',
    'İlk sayfayı deneyip etiket sınırlarına oturduğunu doğrulayın.',
  ]) {
    doc.text(pdfText(`• ${satir}`, fonts), sol, y, { width: 160 * MM })
    y += 6 * MM
  }
}

/**
 * Etiket föyünü PDF stream olarak üretir.
 * Buffer toplamak yerine stream dönüyoruz: 1078 etikette bellek şişmesin.
 *
 * @returns pdfkit belgesi (readable stream)
 */
export function streamLabelPdf(locations = [], opts = {}) {
  const tpl = getTemplate(opts.template)
  const cal = normalizeCalibration(opts.calibration)
  const baseUrl = opts.baseUrl || 'https://avskamp.com'
  const kayitlar = (locations || []).filter(k => k && k.token)
  const perPage = labelsPerPage(tpl)

  const doc = new PDFDocument({
    size: [tpl.page.w * MM, tpl.page.h * MM],
    margin: 0,
    bufferPages: false,
    autoFirstPage: false,
  })
  const fonts = registerTurkishFonts(doc)

  // GERÇEK akış buradan doğar: hedefe ÇİZİM BAŞLAMADAN bağlanmak gerekir.
  // Sonradan pipe edilirse pdfkit geri basınç uygulamadığı için 1078 etiketin
  // tamamı (~10 MB) bellekte birikir — "stream" adı kalır, faydası kalmaz.
  if (opts.pipeTo) doc.pipe(opts.pipeTo)

  const etiketSayfa = Math.max(1, Math.ceil(kayitlar.length / perPage))

  if (opts.coverPage !== false && tpl.key !== 'tek_100x70') {
    doc.addPage()
    kapakSayfasi(doc, fonts, {
      tpl, adet: kayitlar.length, sayfa: etiketSayfa,
      batchNo: opts.batchNo, filtre: opts.filters,
    })
  }

  // Kayıt yoksa boş PDF "hepsi basıldı" gibi okunur.
  if (kayitlar.length === 0) {
    doc.addPage()
    doc.font(fonts.bold).fontSize(13).fillColor(RENK.metin)
    doc.text(pdfText('Basılacak etiket yok', fonts), 20 * MM, 40 * MM, { width: 160 * MM, align: 'center' })
    doc.font(fonts.regular).fontSize(9).fillColor(RENK.soluk)
    doc.text(pdfText('Seçtiğiniz filtreye uyan, aktif QR kodu olan konum bulunamadı.', fonts),
      20 * MM, 48 * MM, { width: 160 * MM, align: 'center' })
    doc.end()
    return doc
  }

  const seriler = []
  kayitlar.forEach((konum, i) => {
    const sayfaIci = i % perPage
    if (sayfaIci === 0) doc.addPage()

    const sutun = sayfaIci % tpl.cols
    const satir = Math.floor(sayfaIci / tpl.cols)

    // Kalibrasyon: yazıcı kayması milimetre olarak telafi edilir.
    const x = (tpl.marginX + cal.offset_x_mm + sutun * (tpl.labelW + tpl.gapX)) * MM
    const y = (tpl.marginY + cal.offset_y_mm + satir * (tpl.labelH + tpl.gapY)) * MM
    const w = tpl.labelW * MM * cal.scale
    const h = tpl.labelH * MM * cal.scale

    seriler.push(drawLabel(doc, fonts, konum, { x, y, w, h, tpl, baseUrl, cut: opts.cutMarks !== false }))
  })

  doc.end()
  doc.__seriler = seriler
  return doc
}

// Kalibrasyon sayfası: QR içermez, yalnız etiket sınırlarını çizer. Kullanıcı
// basıp etiket kâğıdının üstüne tutarak kaymayı ölçer.
export function streamCalibrationPdf(opts = {}) {
  const tpl = getTemplate(opts.template)
  const cal = normalizeCalibration(opts.calibration)
  const doc = new PDFDocument({ size: [tpl.page.w * MM, tpl.page.h * MM], margin: 0, autoFirstPage: true })
  const fonts = registerTurkishFonts(doc)
  if (opts.pipeTo) doc.pipe(opts.pipeTo)
  const perPage = labelsPerPage(tpl)

  for (let i = 0; i < perPage; i += 1) {
    const sutun = i % tpl.cols
    const satir = Math.floor(i / tpl.cols)
    const x = (tpl.marginX + cal.offset_x_mm + sutun * (tpl.labelW + tpl.gapX)) * MM
    const y = (tpl.marginY + cal.offset_y_mm + satir * (tpl.labelH + tpl.gapY)) * MM
    const w = tpl.labelW * MM * cal.scale
    const h = tpl.labelH * MM * cal.scale

    doc.save().lineWidth(0.6).strokeColor('#000000').rect(x, y, w, h).stroke().restore()
    // Köşe işaretleri: kâğıdın etiket kesimiyle hizalamak için.
    doc.save().lineWidth(0.4).strokeColor('#888888')
      .moveTo(x + w / 2, y).lineTo(x + w / 2, y + 4 * MM)
      .moveTo(x, y + h / 2).lineTo(x + 4 * MM, y + h / 2).stroke().restore()

    doc.font(fonts.regular).fontSize(7).fillColor('#444444')
    doc.text(pdfText(`${tpl.labelW} × ${tpl.labelH} mm  ·  #${i + 1}`, fonts), x + 5 * MM, y + h / 2 - 3, {
      width: w - 10 * MM, lineBreak: false,
    })
  }

  doc.font(fonts.bold).fontSize(9).fillColor('#000000')
  doc.text(pdfText(
    `Kalibrasyon — ${tpl.label} · ofset ${cal.offset_x_mm}/${cal.offset_y_mm} mm · ölçek %${Math.round(cal.scale * 100)}`,
    fonts), 5 * MM, 3 * MM, { width: (tpl.page.w - 10) * MM, lineBreak: false })

  doc.end()
  return doc
}
