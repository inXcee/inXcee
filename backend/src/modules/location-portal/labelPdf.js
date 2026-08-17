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

// Belge iskeleti. Senkron ve akışlı üretim aynı yerden kurulur ki ikisi
// arasında sessiz bir yerleşim farkı oluşmasın.
function belgeHazirla(locations, opts) {
  const tpl = getTemplate(opts.template)
  const cal = normalizeCalibration(opts.calibration)
  const baseUrl = opts.baseUrl || 'https://avskamp.com'
  const kayitlar = (locations || []).filter(k => k && k.token)
  const doc = new PDFDocument({
    size: [tpl.page.w * MM, tpl.page.h * MM],
    margin: 0,
    bufferPages: false,
    autoFirstPage: false,
  })
  const fonts = registerTurkishFonts(doc)
  return { doc, fonts, tpl, cal, baseUrl, kayitlar, perPage: labelsPerPage(tpl) }
}

// Kapak ve "etiket yok" sayfası. Basılacak kayıt yoksa belgeyi kapatır ve
// true döner — boş PDF "hepsi basıldı" gibi okunmasın diye açık uyarı basılır.
function girisSayfalari(ctx, opts) {
  const { doc, fonts, tpl, kayitlar, perPage } = ctx
  const etiketSayfa = Math.max(1, Math.ceil(kayitlar.length / perPage))

  if (opts.coverPage !== false && tpl.key !== 'tek_100x70') {
    doc.addPage()
    kapakSayfasi(doc, fonts, {
      tpl, adet: kayitlar.length, sayfa: etiketSayfa,
      batchNo: opts.batchNo, filtre: opts.filters,
    })
  }

  if (kayitlar.length > 0) return false

  doc.addPage()
  doc.font(fonts.bold).fontSize(13).fillColor(RENK.metin)
  doc.text(pdfText('Basılacak etiket yok', fonts), 20 * MM, 40 * MM, { width: 160 * MM, align: 'center' })
  doc.font(fonts.regular).fontSize(9).fillColor(RENK.soluk)
  doc.text(pdfText('Seçtiğiniz filtreye uyan, aktif QR kodu olan konum bulunamadı.', fonts),
    20 * MM, 48 * MM, { width: 160 * MM, align: 'center' })
  doc.end()
  doc.__seriler = []
  return true
}

/**
 * Etiketleri çizer ve HER SAYFA SONUNDA durur (yield).
 *
 * Duraklar akışlı üretimin tek dayanağı: pdfkit çizimi senkron yapar, bu
 * yüzden araya olay döngüsü girmezse pipe'ın yazma geri çağrıları hiç
 * çalışamaz ve PDF'in tamamı pdfkit'in okuma tamponunda birikir.
 */
function* etiketAdimlari(ctx, opts, seriler) {
  const { doc, fonts, tpl, cal, baseUrl, kayitlar, perPage } = ctx
  for (let i = 0; i < kayitlar.length; i += 1) {
    const sayfaIci = i % perPage
    if (sayfaIci === 0) {
      if (i > 0) yield i          // önceki sayfa bitti
      doc.addPage()
    }
    const sutun = sayfaIci % tpl.cols
    const satir = Math.floor(sayfaIci / tpl.cols)

    // Kalibrasyon: yazıcı kayması milimetre olarak telafi edilir.
    const x = (tpl.marginX + cal.offset_x_mm + sutun * (tpl.labelW + tpl.gapX)) * MM
    const y = (tpl.marginY + cal.offset_y_mm + satir * (tpl.labelH + tpl.gapY)) * MM
    const w = tpl.labelW * MM * cal.scale
    const h = tpl.labelH * MM * cal.scale

    seriler.push(drawLabel(doc, fonts, kayitlar[i], { x, y, w, h, tpl, baseUrl, cut: opts.cutMarks !== false }))
  }
}

/**
 * Etiket föyünü tek seferde (senkron) üretir.
 *
 * DİKKAT: buradaki `pipeTo` hedefi baştan bağlar ama TEK BAŞINA AKIŞ SAĞLAMAZ.
 * Çizim baştan sona senkron olduğu için olay döngüsü araya giremez ve bütün
 * PDF pdfkit'in okuma tamponunda birikir. Kampüs ölçeğinde (1174+ etiket,
 * ~4 MB) gerçek akış için `writeLabelPdfTo` kullanılmalıdır.
 *
 * @returns pdfkit belgesi
 */
export function streamLabelPdf(locations = [], opts = {}) {
  const ctx = belgeHazirla(locations, opts)
  if (opts.pipeTo) ctx.doc.pipe(opts.pipeTo)
  if (girisSayfalari(ctx, opts)) return ctx.doc

  const seriler = []
  // Senkron tüketim: duraklara uğrar ama beklemez.
  for (const _durak of etiketAdimlari(ctx, opts, seriler)) { /* duraksız devam */ }

  ctx.doc.end()
  ctx.doc.__seriler = seriler
  return ctx.doc
}

/**
 * GERÇEK akışlı üretim: hedefe bağlanır, her sayfadan sonra olay döngüsüne
 * dönerek pipe'ın biriken yazmalarını boşaltır.
 *
 * 1174+ etikette senkron sürüm PDF'in tamamını (~4 MB) bellekte tutuyordu;
 * bu sürümde tamponda aynı anda yalnız birkaç sayfa durur.
 *
 * @param target  Writable (HTTP yanıtı, dosya akışı…)
 * @returns bitince pdfkit belgesi (seriler `__seriler` içinde)
 */
export async function writeLabelPdfTo(target, locations = [], opts = {}) {
  const ctx = belgeHazirla(locations, opts)
  ctx.doc.pipe(target)
  // Belgeyi üretim SÜRERKEN dışarı verir: akışın gerçekten boşaldığını
  // ölçebilmek (doc.readableLength) buna bağlı.
  if (typeof opts.onDocument === 'function') opts.onDocument(ctx.doc)

  const bitti = new Promise((coz, red) => {
    target.once('finish', coz)
    target.once('error', red)
    ctx.doc.once('error', red)
  })

  if (!girisSayfalari(ctx, opts)) {
    const seriler = []
    for (const _durak of etiketAdimlari(ctx, opts, seriler)) {
      // Olay döngüsüne dönüş: pipe biriken yazmaları hedefe aktarır.
      await new Promise(coz => { setImmediate(coz) })
    }
    ctx.doc.end()
    ctx.doc.__seriler = seriler
  }

  await bitti
  return ctx.doc
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
