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

// "3 gömlek mavi, 2 pantolon siyah, yelek" → [{type, color, qty}] (çok-segment).
// Tip eşleşmeyen segmentte kalan kelimeler custom tip adı olur (ölü uç yok).
export function parseClothingLine(text, clothingTypes) {
  const segments = (text || '').split(/[,;·+]/).map(s => s.trim()).filter(Boolean)
  const out = []
  for (const seg of segments) {
    const parsed = parseClothingText(seg, clothingTypes)
    if (!parsed.type) {
      // qty + renk/desen adını metinden ayıkla, kalan custom tip olsun
      let rem = seg
      const numMatch = rem.match(/(?:^|\s)(\d+)(?:\s|$)/)
      if (numMatch) rem = rem.replace(numMatch[1], ' ')
      if (parsed.color) rem = rem.replace(new RegExp(parsed.color, 'i'), ' ')
      const custom = rem.replace(/\s+/g, ' ').trim()
      if (!custom) continue
      out.push({ type: custom, color: parsed.color, qty: parsed.qty })
    } else {
      out.push(parsed)
    }
  }
  return out
}

// Premium çok-segment: "3 gömlek mavi çizgili L Lacoste, 2 pantolon" →
// parseQuickPremium'un segment listesi (tip eşleşmeyen segment atlanır;
// premium kayıtta tip zorunlu).
export function parsePremiumLine(text, clothingTypes) {
  return (text || '').split(/[,;·+]/)
    .map(s => s.trim()).filter(Boolean)
    .map(seg => parseQuickPremium(seg, clothingTypes))
    .filter(p => p.type)
}

// "m1 205" / "205 m1" / "M1205" → rooms listesinden oda kaydı | null.
// Blok adları parametredeki rooms'tan türetilir (DB'de ne varsa o).
export function findRoom(text, rooms) {
  const raw = (text || '').trim().toUpperCase().replace(/[-_/.]+/g, ' ')
  if (!raw) return null
  const blockSet = new Set(rooms.map(r => String(r.block).toUpperCase()))
  let block = null, room = null
  for (const t of raw.split(/\s+/)) {
    if (!block && blockSet.has(t)) { block = t; continue }
    if (!block && !room) {
      const m = t.match(/^([A-Z]+\d*?)(\d{1,3})$/)
      if (m && blockSet.has(m[1])) { block = m[1]; room = m[2]; continue }
    }
    if (!room && /^\d{1,4}$/.test(t)) { room = t; continue }
  }
  if (!block || !room) return null
  const roomNo = String(Number(room))
  return rooms.find(r =>
    String(r.block).toUpperCase() === block && String(r.room_no) === roomNo
  ) || null
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
