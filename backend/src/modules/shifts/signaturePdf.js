import { registerTurkishFonts, pdfText } from '../../shared/pdf/fonts.js'

// Haftalık imza föyü — GERÇEK PDF.
//
// Ekrandaki "yazdır" tarayıcının baskı diyaloğunu açıyordu: kullanıcı oradan
// "PDF olarak kaydet"i bulmak zorundaydı, üstelik kenar boşluğu/ölçek/başlık
// ayarları makineden makineye değişiyordu. İmza föyü ıslak imzayla dolaşan bir
// belge; her seferinde aynı çıkmalı. Bu yüzden sunucuda üretilir: font sabit
// (DejaVu/Arial), sayfa ölçüsü sabit, tek tıkla iner.
//
// Yerleşim modeli istemcide kurulur (buildWeeklySignatureModel, testli); burası
// yalnız çizim yapar. Böylece HTML çıktısı ile PDF aynı kaynaktan beslenir.

const RENK = {
  metin: '#111827',
  soluk: '#6b7280',
  cizgi: '#9ca3af',
  ince: '#d1d5db',
  bant: '#e5e7eb',
  baslik: '#f3f4f6',
  izin: '#fef3c7',
  yok: '#fee2e2',
}

const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

function gunAdi(tarih) {
  const d = new Date(`${tarih}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '' : (GUNLER[d.getDay()] || '')
}

// İmza atılamayan günler (izin/rapor/devamsız) hafifçe renklenir ki föye bakan
// kişi boş bırakılmış imza ile imza aranmayan günü karıştırmasın.
function hucreZemini(kategori) {
  if (kategori === 'working') return null
  if (kategori === 'absent') return RENK.yok
  return RENK.izin
}

export function signatureColumnWidths({ dayCount, showRole, usableWidth }) {
  const no = 26
  const ad = Math.min(150, Math.max(96, usableWidth * 0.17))
  const gorev = showRole ? Math.min(105, Math.max(64, usableWidth * 0.11)) : 0
  const kalan = usableWidth - no - ad - gorev
  const gun = dayCount > 0 ? kalan / dayCount : kalan
  return { no, ad, gorev, gun }
}

function metin(doc, deger, fonts, { x, y, w, size = 8, bold = false, color = RENK.metin, align = 'left' }) {
  doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(color)
    .text(pdfText(deger, fonts), x, y, { width: w, align, lineBreak: false, ellipsis: true })
}

function sayfaBasligi(doc, fonts, { page, weekLabel, revision, generated }, x, y, w) {
  metin(doc, 'HAFTALIK PERSONEL İMZA FÖYÜ', fonts, { x, y, w, size: 13, bold: true })
  metin(doc, `${page.department} · ${weekLabel} · ${page.rows.length} personel`, fonts,
    { x, y: y + 17, w: w * 0.7, size: 8, color: RENK.soluk })
  const sag = [`Revizyon: ${revision}`, `Sayfa: ${page.page}/${page.page_count}`]
  if (generated) sag.push(`Oluşturma: ${generated}`)
  sag.forEach((satir, i) => metin(doc, satir, fonts,
    { x: x + w * 0.68, y: y + i * 10, w: w * 0.32, size: 7.5, color: RENK.soluk, align: 'right' }))
  doc.moveTo(x, y + 31).lineTo(x + w, y + 31).lineWidth(1.2).strokeColor(RENK.cizgi).stroke()
  return y + 38
}

function tabloBasligi(doc, fonts, model, gen, x, y) {
  const h = 22
  doc.rect(x, y, gen.no + gen.ad + gen.gorev + gen.gun * model.dates.length, h)
    .fillAndStroke(RENK.baslik, RENK.cizgi)
  let cx = x
  metin(doc, 'No', fonts, { x: cx + 2, y: y + 7, w: gen.no - 4, size: 7.5, bold: true, align: 'center' }); cx += gen.no
  metin(doc, 'Personel', fonts, { x: cx + 4, y: y + 7, w: gen.ad - 8, size: 7.5, bold: true }); cx += gen.ad
  if (gen.gorev) { metin(doc, 'Görev', fonts, { x: cx + 4, y: y + 7, w: gen.gorev - 8, size: 7.5, bold: true }); cx += gen.gorev }
  model.dates.forEach(tarih => {
    metin(doc, gunAdi(tarih), fonts, { x: cx + 2, y: y + 3, w: gen.gun - 4, size: 7.5, bold: true, align: 'center' })
    metin(doc, tarih, fonts, { x: cx + 2, y: y + 13, w: gen.gun - 4, size: 6.5, color: RENK.soluk, align: 'center' })
    cx += gen.gun
  })
  return y + h
}

function satirCiz(doc, fonts, { row, sira, model, gen, x, y, h }) {
  let cx = x
  const kutu = (w, zemin) => {
    doc.rect(cx, y, w, h).lineWidth(0.5).strokeColor(RENK.ince)
    if (zemin) doc.fillAndStroke(zemin, RENK.ince); else doc.stroke()
  }

  kutu(gen.no); metin(doc, String(sira), fonts, { x: cx + 2, y: y + h / 2 - 4, w: gen.no - 4, size: 7, align: 'center', color: RENK.soluk }); cx += gen.no
  kutu(gen.ad); metin(doc, row.full_name, fonts, { x: cx + 4, y: y + h / 2 - 4, w: gen.ad - 8, size: 8, bold: true }); cx += gen.ad
  if (gen.gorev) {
    kutu(gen.gorev)
    metin(doc, row.role || '-', fonts, { x: cx + 4, y: y + h / 2 - 4, w: gen.gorev - 8, size: 7, color: RENK.soluk })
    cx += gen.gorev
  }

  row.days.forEach(gun => {
    kutu(gen.gun, hucreZemini(gun.category))
    metin(doc, gun.label, fonts, { x: cx + 2, y: y + 3, w: gen.gun - 4, size: 7, bold: true, align: 'center' })
    if (gun.detail) metin(doc, gun.detail, fonts, { x: cx + 2, y: y + 12, w: gen.gun - 4, size: 6, color: RENK.soluk, align: 'center' })
    if (gun.can_sign) {
      // İmza için boş çizgi(ler) — çift imza seçilmişse giriş/çıkış ayrı.
      const adet = model.opts.doubleSignature ? 2 : 1
      const altY = y + h - 4
      for (let i = 0; i < adet; i += 1) {
        const ly = altY - i * 9
        doc.moveTo(cx + 5, ly).lineTo(cx + gen.gun - 5, ly).lineWidth(0.5).strokeColor(RENK.cizgi).stroke()
      }
    } else {
      metin(doc, 'İmza aranmaz', fonts, { x: cx + 2, y: y + h - 11, w: gen.gun - 4, size: 5.5, color: RENK.soluk, align: 'center' })
    }
    cx += gen.gun
  })
}

function bantCiz(doc, fonts, ad, x, y, w) {
  const h = 14
  doc.rect(x, y, w, h).fillAndStroke(RENK.bant, RENK.cizgi)
  metin(doc, ad, fonts, { x: x + 5, y: y + 4, w: w - 10, size: 8, bold: true })
  return y + h
}

function altBilgi(doc, fonts, x, y, w) {
  const yarim = w / 2 - 10
  ;['Listeyi Hazırlayan / İmza', 'Vardiya Amiri Kontrolü / İmza'].forEach((etiket, i) => {
    const bx = x + i * (yarim + 20)
    doc.moveTo(bx, y + 22).lineTo(bx + yarim, y + 22).lineWidth(0.6).strokeColor(RENK.cizgi).stroke()
    metin(doc, etiket, fonts, { x: bx, y: y + 25, w: yarim, size: 7, color: RENK.soluk })
  })
}

// Modeli sayfa sayfa çizer. doc çağıran tarafından açılır/kapatılır ki hem
// HTTP yanıtına hem teste (bellek) aynı yolla akabilsin.
export function drawSignaturePdf(doc, model, meta = {}) {
  const fonts = registerTurkishFonts(doc, 'Sig')
  const revision = meta.revision || '1'
  const generated = meta.generated || ''
  const weekLabel = meta.weekLabel || (model.dates || []).join(' - ')
  const pages = model.pages || []

  const x = doc.page.margins.left
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const gen = signatureColumnWidths({
    dayCount: (model.dates || []).length,
    showRole: model.opts?.showLocationAndRole !== false,
    usableWidth,
  })
  const satirYuksekligi = model.opts?.doubleSignature ? 34 : 26

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage()
    let y = sayfaBasligi(doc, fonts, { page, weekLabel, revision, generated }, x, doc.page.margins.top, usableWidth)
    y = tabloBasligi(doc, fonts, model, gen, x, y)

    let oncekiBolum = ''
    const tabloGenislik = gen.no + gen.ad + gen.gorev + gen.gun * (model.dates || []).length
    page.rows.forEach((row, i) => {
      if (page.combined && model.opts?.showDepartmentBands !== false && row.department !== oncekiBolum) {
        y = bantCiz(doc, fonts, row.department, x, y, tabloGenislik)
        oncekiBolum = row.department
      }
      satirCiz(doc, fonts, { row, sira: (page.row_offset || 0) + i + 1, model, gen, x, y, h: satirYuksekligi })
      y += satirYuksekligi
    })

    // Sonradan eklenen kişiler için boş satırlar — föy elde doldurulabilsin.
    if (page.show_blank_rows && Number(model.opts?.blankRows) > 0) {
      const bos = Math.min(6, Number(model.opts.blankRows))
      for (let i = 0; i < bos; i += 1) {
        satirCiz(doc, fonts, {
          row: { full_name: '', role: '', days: (model.dates || []).map(d => ({ date: d, label: '', detail: '', can_sign: true, category: 'working' })) },
          sira: '', model, gen, x, y, h: satirYuksekligi,
        })
        y += satirYuksekligi
      }
    }

    altBilgi(doc, fonts, x, y + 6, usableWidth)
  })

  return { pageCount: pages.length }
}
