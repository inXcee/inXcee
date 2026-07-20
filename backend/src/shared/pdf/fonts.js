import fs from 'node:fs'

// pdfkit'in gömülü Helvetica'sı WinAnsi kodlamalıdır: ğ/ş/İ/ı harfleri bozulur.
// Sistemde Unicode bir TTF varsa onu kaydederiz; yoksa metni ASCII'ye indiririz
// (bozuk glif yerine okunabilir "Osmangazi" görünsün).
const FONT_CANDIDATES = [
  ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf'],
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  ['/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'],
  ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'],
]

const ASCII_MAP = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' }

export function registerTurkishFonts(doc, prefix = 'Tr') {
  const pair = FONT_CANDIDATES.find(([regular, bold]) => fs.existsSync(regular) && fs.existsSync(bold))
  const fallback = { regular: 'Helvetica', bold: 'Helvetica-Bold', unicode: false }
  if (!pair) return fallback
  try {
    doc.registerFont(`${prefix}Regular`, pair[0])
    doc.registerFont(`${prefix}Bold`, pair[1])
    return { regular: `${prefix}Regular`, bold: `${prefix}Bold`, unicode: true }
  } catch {
    return fallback
  }
}

export function pdfText(value, fonts) {
  const text = String(value ?? '')
  if (!fonts || fonts.unicode !== false) return text
  return text.replace(/[çÇğĞıİöÖşŞüÜ]/g, char => ASCII_MAP[char] || char)
}
