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

// Tüm metinler mutlak konumla çizilir. pdfkit, satırın alt kenarı yazılabilir
// alanı bir punto aşarsa SESSİZCE yeni sayfa açar; o sayfada ne başlık ne tablo
// olur. Satır yüksekliği fonta bağlı olduğu için (sunucuda DejaVu, Windows'ta
// Arial) sınıra dayanan yerleşim yerelde temiz görünüp canlıda hayalet sayfa
// üretiyordu. Konumu sayfa içinde tutmak bunu kaynağında keser.
function metin(doc, deger, fonts, { x, y, w, size = 8, bold = false, color = RENK.metin, align = 'left' }) {
  doc.font(bold ? fonts.bold : fonts.regular).fontSize(size).fillColor(color)
  const enAlt = doc.page.maxY() - doc.currentLineHeight()
  doc.text(pdfText(deger, fonts), x, Math.min(y, enAlt), { width: w, align, lineBreak: false, ellipsis: true })
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

// Satır yüksekliği sayfaya göre uyarlanır: kullanıcı "tek sayfaya 30 kişi"
// istiyor ama sabit 26pt ile A4 yatayda ancak ~17 satır giriyordu, gerisi
// taşıyordu. Az satır istendiğinde gereksiz sıkıştırma yapılmaz.
const MIN_ROW = 13   // altına inince imza atacak yer kalmıyor
const MAX_ROW = 26
const MAX_ROW_DOUBLE = 34

export function signatureRowHeight({ rowsPerPage, usableHeight, doubleSignature = false }) {
  const tavan = doubleSignature ? MAX_ROW_DOUBLE : MAX_ROW
  const adet = Math.max(1, Number(rowsPerPage) || 1)
  // Taban okunabilirlik içindir: sığmıyorsa satırı daha da küçültmek yerine
  // sayfa artar — imza atılamayan bir föy işe yaramaz.
  return Math.max(MIN_ROW, Math.min(tavan, Math.floor(usableHeight / adet)))
}

// HAFTA İÇİ DEĞİŞİKLİK KAYDI.
//
// Föy hafta başında basılıp hafta boyunca imzalanıyor; bu arada izin kayıyor,
// kişi hastalanıp raporlu oluyor, OFF günü değişiyor. Kâğıtta yapısal bir yer
// olmayınca değişiklik ya hiç kaydedilmiyor ya satırın üstüne karalanıyor ve
// hangi imzayla ilişkili olduğu kayboluyor.
const CHANGE_COLS = [
  ['Tarih', 0.10],
  ['Personel', 0.22],
  ['Planlanan', 0.15],
  ['Gerçekleşen', 0.15],
  ['Açıklama', 0.24],
  ['Onay / İmza', 0.14],
]

export function changeLogRowCount(opts = {}) {
  // HTML föyü bu tabloyu blankRows ile sürüyor; PDF de aynı kaynaktan beslenir,
  // yoksa aynı belgenin iki çıktısı farklı sayıda satır gösterir.
  const istenen = opts.changeRows ?? opts.blankRows
  if (Number(istenen) === 0) return 0
  const sayi = Number(istenen)
  return Math.max(0, Math.min(12, Number.isFinite(sayi) ? sayi : 4))
}

function degisiklikBlogu(doc, fonts, x, y, w, satirSayisi) {
  if (satirSayisi <= 0) return y
  metin(doc, 'HAFTA İÇİ DEĞİŞİKLİK KAYDI', fonts, { x, y, w: 200, size: 9, bold: true })
  metin(doc, 'Föy basıldıktan sonra değişen izin / rapor / OFF ve vardiya kaydırmaları buraya yazılır.',
    fonts, { x: x + 205, y: y + 1, w: w - 205, size: 7, color: RENK.soluk })

  let cy = y + 14
  const h = 15
  let cx = x
  doc.rect(x, cy, w, h).fillAndStroke(RENK.baslik, RENK.cizgi)
  CHANGE_COLS.forEach(([baslik, oran]) => {
    metin(doc, baslik, fonts, { x: cx + 4, y: cy + 4, w: w * oran - 8, size: 7.5, bold: true })
    cx += w * oran
  })
  cy += h

  for (let i = 0; i < satirSayisi; i += 1) {
    cx = x
    CHANGE_COLS.forEach(([, oran]) => {
      doc.rect(cx, cy, w * oran, h).lineWidth(0.5).strokeColor(RENK.ince).stroke()
      cx += w * oran
    })
    cy += h
  }
  return cy
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
  const bantGosteriliyor = model.opts?.showDepartmentBands !== false
  const bosSatir = Math.min(6, Math.max(0, Number(model.opts?.blankRows) || 0))
  const degisiklikSatiri = changeLogRowCount(model.opts || {})

  // Sayfa sayısı TAHMİN edilmez, sayılır. Tahmin edilince pdfkit'in kendi
  // eklediği sayfalar sayıma girmiyor ve uç, çağırana yanlış sayı bildiriyordu.
  let sayfaAdedi = pages.length > 0 ? 1 : 0
  const sayfaEkle = () => { doc.addPage(); sayfaAdedi += 1 }

  // Alt bilgi için ayrılan pay cömert tutulur: kenara dayanan çizim pdfkit'e
  // SESSİZCE yeni sayfa açtırıyor ve o sayfada ne başlık ne tablo başlığı
  // oluyor. Satır yüksekliği fontla birlikte değiştiği için (sunucuda DejaVu,
  // Windows'ta Arial) sınıra dayanmak yerelde geçip canlıda bozulan bir hata.
  // Alt bilgi kutusu ~34pt (çizgi +22, etiket +25 ve satır yüksekliği). 46
  // bunun üstüne pay bırakır; daha cömert tutmak "30 kişi tek sayfa" isteğini
  // birkaç punto farkla bozuyordu.
  const altBilgiYuksekligi = 46
  const sayfaDibi = doc.page.height - doc.page.margins.bottom - altBilgiYuksekligi

  // Satır yüksekliği başlıklar ÇİZİLDİKTEN sonra hesaplanır: başlık yüksekliğini
  // sabit varsaymak fontla birlikte kayıyor. Başlıklar her sayfada aynı olduğu
  // için ilk sayfada ölçmek yeterli.
  let satirYuksekligi = null
  let kullanilacakBosSatir = 0

  pages.forEach((page, index) => {
    if (index > 0) sayfaEkle()
    let y = sayfaBasligi(doc, fonts, { page, weekLabel, revision, generated }, x, doc.page.margins.top, usableWidth)
    y = tabloBasligi(doc, fonts, model, gen, x, y)

    if (satirYuksekligi === null) {
      // Departman bantları da yer kaplıyor (birleşik listede her bölüm
      // değişiminde bir şerit); bütçeye katılmazsa son satırlar taşıyor.
      const bantSayisi = !bantGosteriliyor ? 0 : pages.reduce((m, p) => {
        if (!p.combined) return m
        return Math.max(m, new Set((p.rows || []).map(r => r.department)).size)
      }, 0)
      const enCokSatir = pages.reduce((m, p) => Math.max(m, (p.rows || []).length), 0)
      const kullanilabilir = sayfaDibi - y - bantSayisi * 14
      satirYuksekligi = signatureRowHeight({
        // Boş satırlar da yer kaplıyor; bütçeye katılmazsa son satırlar taşar.
        rowsPerPage: enCokSatir + bosSatir,
        usableHeight: kullanilabilir,
        doubleSignature: model.opts?.doubleSignature,
      })
      // Sığmıyorsa BOŞ satır kısılır, gerçek personel değil: kadro sayfayı
      // belirler, dolgu ona uyar.
      const sigacak = Math.floor(kullanilabilir / satirYuksekligi)
      kullanilacakBosSatir = Math.max(0, Math.min(bosSatir, sigacak - enCokSatir))
    }

    let oncekiBolum = ''
    const tabloGenislik = gen.no + gen.ad + gen.gorev + gen.gun * (model.dates || []).length
    const yeniSayfa = () => {
      sayfaEkle()
      const ny = sayfaBasligi(doc, fonts, { page, weekLabel, revision, generated }, x, doc.page.margins.top, usableWidth)
      oncekiBolum = ''
      return tabloBasligi(doc, fonts, model, gen, x, ny)
    }

    page.rows.forEach((row, i) => {
      const bantGerek = page.combined && bantGosteriliyor && row.department !== oncekiBolum
      if (y + satirYuksekligi + (bantGerek ? 14 : 0) > sayfaDibi) y = yeniSayfa()
      if (page.combined && bantGosteriliyor && row.department !== oncekiBolum) {
        y = bantCiz(doc, fonts, row.department, x, y, tabloGenislik)
        oncekiBolum = row.department
      }
      satirCiz(doc, fonts, { row, sira: (page.row_offset || 0) + i + 1, model, gen, x, y, h: satirYuksekligi })
      y += satirYuksekligi
    })

    // Sonradan eklenen kişiler için boş satırlar — föy elde doldurulabilsin.
    if (page.show_blank_rows) {
      for (let i = 0; i < kullanilacakBosSatir; i += 1) {
        if (y + satirYuksekligi > sayfaDibi) break
        satirCiz(doc, fonts, {
          row: { full_name: '', role: '', days: (model.dates || []).map(d => ({ date: d, label: '', detail: '', can_sign: true, category: 'working' })) },
          sira: '', model, gen, x, y, h: satirYuksekligi,
        })
        y += satirYuksekligi
      }
    }

    altBilgi(doc, fonts, x, sayfaDibi + 8, usableWidth)
  })

  // Değişiklik kaydı KENDİ sayfasında: kadro sayfasının altına sıkıştırılınca
  // "tek sayfaya 30 kişi" isteği bozuluyor, ayrıca elle yazmaya yer kalmıyor.
  if (degisiklikSatiri > 0 && pages.length > 0) {
    sayfaEkle()
    let y = sayfaBasligi(doc, fonts, {
      page: { department: 'Hafta içi değişiklikler', rows: [], page: sayfaAdedi, page_count: sayfaAdedi },
      weekLabel, revision, generated,
    }, x, doc.page.margins.top, usableWidth)
    y = degisiklikBlogu(doc, fonts, x, y + 4, usableWidth, degisiklikSatiri)
    altBilgi(doc, fonts, x, Math.max(y + 12, sayfaDibi + 8), usableWidth)
  }

  return { pageCount: sayfaAdedi }
}
