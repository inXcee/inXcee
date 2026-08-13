import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { registerTurkishFonts, pdfText } from '../../shared/pdf/fonts.js'

// QR etiket föyü — kesilip odalara asılacak.
//
// QR üretildi ama kimse göremiyordu: yönetim ekranı da, baskı çıktısı da yoktu.
// 1078 etiketi tek tek ekrandan kopyalamak mümkün değil; iş ancak basılabilir
// bir föyle yapılır.
//
// Sayfa başına 3×4 = 12 etiket. Kesim çizgileri var, çünkü etiketler makasla
// ayrılıp kapılara asılacak.

const A4 = { w: 595.28, h: 841.89 }
const KENAR = 28
const SUTUN = 3
const SATIR = 4
export const SAYFA_BASINA = SUTUN * SATIR

const RENK = {
  metin: '#111111',
  soluk: '#666666',
  kesim: '#cccccc',
}

// Etiketin üstündeki adres satırı: "M1 · Kat 1"
export function konumAltBaslik(konum) {
  const parcalar = []
  if (konum.block) parcalar.push(konum.block)
  if (konum.floor != null && konum.floor !== '') parcalar.push(`Kat ${konum.floor}`)
  if (konum.area_code) parcalar.push(konum.area_code)
  return parcalar.join(' · ')
}

// Basılan adres, QR'ın işaret ettiği adresle AYNI olmalı; ayrı ayrı kurulursa
// biri değişince diğeri sessizce eski kalır.
export function portalUrl(baseUrl, token) {
  const temiz = String(baseUrl || '').replace(/\/+$/, '')
  return `${temiz}/r/${token}`
}

export function sayfaSayisi(adet, sayfaBasina = SAYFA_BASINA) {
  return Math.max(1, Math.ceil((adet || 0) / sayfaBasina))
}

async function qrPng(url) {
  // 'M' seviyesi: etiket yıpranırsa/kirlenirse bir miktar hasarı tolere eder.
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#000000', light: '#FFFFFF' },
  })
}

/**
 * @param {Array} locations - { token, display_name, block, floor, area_code, location_type }
 * @param {object} opts     - { baseUrl, title }
 * @returns {Promise<Buffer>}
 */
export async function buildQrSheetPdf(locations = [], opts = {}) {
  const kayitlar = (locations || []).filter(k => k && k.token)
  const baseUrl = opts.baseUrl || 'https://avskamp.com'

  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true })
  const fonts = registerTurkishFonts(doc)
  const parcalar = []
  doc.on('data', p => parcalar.push(p))
  const bitti = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(parcalar))))

  const hucreW = (A4.w - KENAR * 2) / SUTUN
  const hucreH = (A4.h - KENAR * 2) / SATIR

  // QR üretimi CPU-bağımlı ve etiket başına ~11 ms; 1078 etikette 12 sn sürüyor.
  // Baskı kalitesini düşürmek yerine (320 px, lazer baskıda net) çizimden önce
  // toplu üretiyoruz. Pratikte blok blok basılır: bir blok ~100 etiket, ~1 sn.
  const qrler = await Promise.all(kayitlar.map(k => qrPng(portalUrl(baseUrl, k.token))))

  // Kayıt yoksa boş bir PDF döndürmek "her şey basıldı" gibi okunur.
  if (kayitlar.length === 0) {
    doc.font(fonts.bold).fontSize(13).fillColor(RENK.metin)
    doc.text(pdfText('Basılacak QR kodu bulunamadı', fonts), KENAR, 120, { width: A4.w - KENAR * 2, align: 'center' })
    doc.font(fonts.regular).fontSize(9).fillColor(RENK.soluk)
    doc.text(pdfText('Seçtiğiniz filtreye uyan, aktif QR kodu olan konum yok.', fonts), KENAR, 145, {
      width: A4.w - KENAR * 2, align: 'center',
    })
    doc.end()
    return bitti
  }

  for (let i = 0; i < kayitlar.length; i += 1) {
    const konum = kayitlar[i]
    const sayfaIci = i % SAYFA_BASINA
    if (i > 0 && sayfaIci === 0) doc.addPage({ size: 'A4', margin: 0 })

    const sutun = sayfaIci % SUTUN
    const satir = Math.floor(sayfaIci / SUTUN)
    const x = KENAR + sutun * hucreW
    const y = KENAR + satir * hucreH

    // Kesim çerçevesi — etiketler makasla ayrılacak.
    doc.save().lineWidth(0.5).strokeColor(RENK.kesim)
      .rect(x + 2, y + 2, hucreW - 4, hucreH - 4).dash(3, { space: 3 }).stroke().undash().restore()

    const png = qrler[i]

    const qrBoy = Math.min(hucreW - 44, hucreH - 78)
    const qrX = x + (hucreW - qrBoy) / 2
    doc.image(png, qrX, y + 16, { width: qrBoy, height: qrBoy })

    let metinY = y + 16 + qrBoy + 8
    doc.font(fonts.bold).fontSize(10).fillColor(RENK.metin)
    doc.text(pdfText(konum.display_name || 'İsimsiz konum', fonts), x + 8, metinY, {
      width: hucreW - 16, align: 'center', lineBreak: false, ellipsis: true,
    })

    metinY += 13
    const alt = konumAltBaslik(konum)
    if (alt) {
      doc.font(fonts.regular).fontSize(8).fillColor(RENK.soluk)
      doc.text(pdfText(alt, fonts), x + 8, metinY, {
        width: hucreW - 16, align: 'center', lineBreak: false, ellipsis: true,
      })
      metinY += 11
    }

    doc.font(fonts.regular).fontSize(6.5).fillColor(RENK.soluk)
    doc.text(pdfText('Arıza bildirmek için okutun', fonts), x + 8, metinY, {
      width: hucreW - 16, align: 'center', lineBreak: false,
    })
  }

  doc.end()
  return bitti
}
