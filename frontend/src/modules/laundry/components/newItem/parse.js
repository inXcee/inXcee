// Hızlı metin girişi ayrıştırma — saf fonksiyonlar (Türkçe normalize + fuzzy eşleştirme)
import { COLOR_PALETTE, PATTERN_LIST, SIZES } from './constants.js'

const TR_MAP = { ğ:'g',Ğ:'g',ş:'s',Ş:'s',ı:'i',İ:'i',ö:'o',Ö:'o',ü:'u',Ü:'u',ç:'c',Ç:'c' }
export function normTR(s) {
  return s.toLowerCase().replace(/[ğĞşŞıİöÖüÜçÇ]/g, c => TR_MAP[c] || c).replace(/[^a-z0-9]/g, '')
}

export function fuzzyFind(word, candidates) {
  const n = normTR(word)
  if (n.length < 2) return null
  return candidates.find(c => normTR(c) === n)
    || candidates.find(c => normTR(c).startsWith(n))
    || candidates.find(c => n.length >= 3 && n.startsWith(normTR(c).slice(0, Math.max(3, Math.floor(normTR(c).length * 0.65)))))
    || null
}

// "3 gömlek mavi çizgili L Lacoste" → { type, color, pattern, brand, size, qty }
export function parseQuickPremium(text, clothingTypes) {
  if (!text.trim()) return { type:'', color:'', pattern:'', brand:'', size:'', qty:1 }
  const words = text.trim().split(/\s+/)
  let type='', color='', pattern='', brand='', size='', qty=1
  const colorNames = COLOR_PALETTE.map(c => c.name)
  const patternNames = PATTERN_LIST.map(p => p.name)
  const remaining = []
  for (const w of words) {
    if (!type) { const t = fuzzyFind(w, clothingTypes); if (t) { type = t; continue } }
    if (!color) { const c = fuzzyFind(w, colorNames); if (c) { color = c; continue } }
    if (!pattern) { const p = fuzzyFind(w, patternNames); if (p) { pattern = p; continue } }
    if (!size) { const sz = SIZES.find(s => s.toLowerCase() === w.toLowerCase()); if (sz) { size = sz; continue } }
    if (qty === 1 && /^\d+$/.test(w)) { qty = Math.min(99, Math.max(1, +w)); continue }
    remaining.push(w)
  }
  brand = remaining.join(' ')
  return { type, color, pattern, brand, size, qty }
}

// "3 gömlek mavi" → { type, color, qty } (regular akış — tam-metin içerme, fuzzy değil)
export function parseClothingText(text, clothingTypes) {
  const lower = text.toLowerCase()
  let rem = lower
  // Qty: sayı bul, metinden çıkar
  let qty = 1
  const numMatch = rem.match(/(?:^|\s)(\d+)(?:\s|$)/)
  if (numMatch) {
    qty = Math.max(1, Math.min(99, +numMatch[1]))
    rem = rem.replace(numMatch[1], ' ').trim()
  }
  // Tip: en uzun eşleşme önce
  const typesSorted = [...clothingTypes].sort((a, b) => b.length - a.length)
  let type = ''
  for (const t of typesSorted) {
    if (rem.includes(t.toLowerCase())) { type = t; rem = rem.replace(t.toLowerCase(), ' ').trim(); break }
  }
  // Renk: en uzun isim önce (Açık Mavi, Mavi gibi çakışmalar için)
  const colorsSorted = [...COLOR_PALETTE].sort((a, b) => b.name.length - a.name.length)
  let color = ''
  for (const cp of colorsSorted) {
    if (rem.includes(cp.name.toLowerCase())) { color = cp.name; break }
  }
  if (!color) {
    for (const p of PATTERN_LIST) {
      if (rem.includes(p.name.toLowerCase())) { color = p.name; break }
    }
  }
  return { type, color, qty }
}
