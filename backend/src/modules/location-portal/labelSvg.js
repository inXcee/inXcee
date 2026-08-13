import QRCode from 'qrcode'
import { getTemplate, labelTheme, shortSerial } from './labelTemplates.js'

// Faz 6 — Tekli etiket: SVG ve PNG.
//
// PDF föyü toplu basım için. Tek bir odanın etiketi yeniden gerekince (kâğıt
// yırtıldı, oda numarası değişti) 135 sayfalık föyü basmak anlamsız. SVG
// vektörel olduğu için matbaaya da verilebilir; PNG'yi aynı SVG'den sharp
// rasterleştirir — yeni bağımlılık yok, iki çıktı tanım gereği aynı görünür.
//
// Ölçüler MİLİMETRE: viewBox mm birimiyle, width/height "mm" ekiyle yazılır ki
// tarayıcı ve matbaa gerçek boyutta bassın.

const XML_KACIS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

// Oda adı kullanıcı verisidir; kaçırılmazsa tek bir "&" SVG'yi bozar.
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => XML_KACIS[ch])
}

// QR modüllerini yan yana birleştirerek dikdörtgene çevirir: dosya küçülür ve
// modüller arasında saç teli boşluk kalmaz.
export function qrRects(qr, x, y, size) {
  const adet = qr.modules.size
  const veri = qr.modules.data
  const sessiz = 4                       // spec: en az 4 modül sessiz alan
  const modul = size / (adet + sessiz * 2)
  const bx = x + sessiz * modul
  const by = y + sessiz * modul
  const parcalar = []
  for (let satir = 0; satir < adet; satir += 1) {
    let sutun = 0
    while (sutun < adet) {
      if (!veri[satir * adet + sutun]) { sutun += 1; continue }
      let uzunluk = 1
      while (sutun + uzunluk < adet && veri[satir * adet + sutun + uzunluk]) uzunluk += 1
      parcalar.push({
        x: +(bx + sutun * modul).toFixed(3),
        y: +(by + satir * modul).toFixed(3),
        w: +(modul * uzunluk).toFixed(3),
        h: +modul.toFixed(3),
      })
      sutun += uzunluk
    }
  }
  return parcalar
}

export function portalUrl(baseUrl, token) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/r/${token}`
}

/**
 * Tek konum için etiket SVG'si.
 * @param konum  { display_name, block, room_no|area_code, location_type, token }
 */
export async function buildLabelSvg(konum, { baseUrl, template = 'tek_100x70' } = {}) {
  if (!konum?.token) {
    // Token'sız etiket basmak, üstünde çalışmayan QR olan kâğıt üretmektir.
    const hata = new Error('Konumun aktif QR kodu yok — etiket üretilemez')
    hata.statusCode = 409
    hata.code = 'no_active_qr'
    throw hata
  }
  const tpl = getTemplate(template)
  const tema = labelTheme(konum.location_type)
  const url = portalUrl(baseUrl, konum.token)
  const seri = shortSerial(konum, konum.token)
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })

  const W = tpl.labelW
  const H = tpl.labelH
  const ic = 4
  const qrBoy = tpl.qrMm
  const qrX = ic
  const qrY = (H - qrBoy) / 2
  const metinX = qrX + qrBoy + 3

  const hizmetler = ['Arıza bildir', 'Temizlik değerlendir', 'Anket doldur']
  if (tema.showLaundry) hizmetler.splice(1, 0, 'Çamaşır aldır')

  const satirlar = hizmetler.map((h, i) =>
    `<text x="${metinX}" y="${(qrY + 17 + i * 4.6).toFixed(2)}" font-size="3.1" fill="#334155">• ${esc(h)}</text>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<title>${esc(konum.display_name)} QR etiketi</title>
<rect width="${W}" height="${H}" fill="#ffffff"/>
<rect x="0" y="0" width="${W}" height="9" fill="${tema.accent}"/>
<text x="${ic}" y="6.2" font-family="sans-serif" font-size="4.4" font-weight="bold" fill="#ffffff">${esc(tema.title)}</text>
<g font-family="sans-serif">
<g fill="#000000">
${qrRects(qr, qrX, qrY, qrBoy).map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`).join('\n')}
</g>
<text x="${metinX}" y="${(qrY + 6).toFixed(2)}" font-size="6" font-weight="bold" fill="#0f172a">${esc(konum.display_name)}</text>
<text x="${metinX}" y="${(qrY + 11.5).toFixed(2)}" font-size="3.4" fill="#64748b">Telefonla okutun</text>
${satirlar.join('\n')}
<text x="${metinX}" y="${(H - 4).toFixed(2)}" font-size="2.9" font-family="monospace" fill="#94a3b8">${esc(seri)}</text>
</g>
<rect x="0.25" y="0.25" width="${W - 0.5}" height="${H - 0.5}" fill="none" stroke="#cbd5e1" stroke-width="0.3"/>
</svg>`.replace(/\n\s*\n/g, '\n')
}

/**
 * Aynı SVG'yi PNG'ye çevirir. sharp zaten projede var (fotoğraf işleme);
 * yeni bağımlılık eklemiyoruz ve iki çıktı tanım gereği aynı görünüyor.
 */
export async function buildLabelPng(konum, { baseUrl, template = 'tek_100x70', dpi = 300 } = {}) {
  const svg = await buildLabelSvg(konum, { baseUrl, template })
  const { default: sharp } = await import('sharp')
  // density SVG'yi hangi çözünürlükte rasterleştireceğini belirler; 300 DPI
  // etiket baskısı için matbaa alt sınırıdır.
  return sharp(Buffer.from(svg), { density: Math.max(72, Math.min(600, Number(dpi) || 300)) })
    .png()
    .toBuffer()
}
