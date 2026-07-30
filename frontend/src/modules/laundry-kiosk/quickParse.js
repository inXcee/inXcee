// Kiosk hızlı giriş ayrıştırıcıları — saf fonksiyonlar.
// normTR/fuzzyFind ana laundry modülünden reuse edilir (newItem/parse.js).
import { fuzzyFind } from '../laundry/components/newItem/parse.js'
import { COLORS, PATTERNS } from './GarmentPicker.jsx'
import { BLOCK_BY_NAME, expectedRoomNos } from '../../shared/blocks.js'

function allRoomNos(blockName) {
  const cfg = BLOCK_BY_NAME[blockName]
  if (!cfg) return []
  const out = []
  for (let f = 1; f <= cfg.floors; f++) out.push(...expectedRoomNos(blockName, f))
  return out
}

// "m1 205" · "205 m1" · "M1205" · "a 12" → { block, room_no } | null
// Blok adı blocks.js sözlüğünden doğrulanır; oda o bloğun gerçek oda
// listesinde yoksa null döner (grid'e düşülür, ölü uca girilmez).
export function parseRoomShortcut(text) {
  const raw = (text || '').trim().toUpperCase().replace(/[-_/.]+/g, ' ')
  if (!raw) return null
  let block = null, room = null
  for (const t of raw.split(/\s+/)) {
    if (!block && BLOCK_BY_NAME[t]) { block = t; continue }
    if (!block && !room) {
      // Bitişik yazım: "M1205" → blok sözlüğü belirsizliği çözer (M1+205)
      const m = t.match(/^([A-Z]+\d*?)(\d{1,3})$/)
      if (m && BLOCK_BY_NAME[m[1]]) { block = m[1]; room = m[2]; continue }
    }
    if (!room && /^\d{1,4}$/.test(t)) { room = t; continue }
  }
  if (!block || !room) return null
  const room_no = String(Number(room))
  const valid = allRoomNos(block).some(no => String(no) === room_no)
  return valid ? { block, room_no } : null
}

// Harf bedenleri — tek başına geçtiğinde beden olarak alınır.
const LETTER_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL'])
const SIZE_KEYWORDS = new Set(['beden', 'numara', 'no'])

function letterSize(token) {
  const upper = token.toUpperCase()
  return LETTER_SIZES.has(upper) ? upper : null
}

// "3 nike gömlek mavi çizgili L, 2 pantolon siyah 42 beden, çorap" →
// kiosk garment entry listesi [{type_id, type_name, emoji, count,
// colors:[{key,label}], pattern, pattern_label, brand, size}]
// Tip eşleşmeyen segment custom isimle eklenir (ölü uç yok).
//
// Beden: harf bedenleri ("L", "XL") tek başına yakalanır; sayısal beden
// yalnızca "42 beden" / "beden 42" kalıbıyla alınır — çıplak sayı ADETtir.
// Marka: tip eşleştikten sonra artan kelimeler markaya gider ("nike gömlek");
// tip eşleşmediyse aynı kelimeler eskisi gibi özel kıyafet adı olur.
export function parseGarmentLine(text, garmentTypes = []) {
  const segments = (text || '').split(/[,;·+]/).map(s => s.trim()).filter(Boolean)
  if (segments.length === 0) return []
  const typeNames = garmentTypes.map(t => t.name)
  const colorLabels = COLORS.map(c => c.label)
  const patternLabels = PATTERNS.map(p => p.label)
  const entries = []
  for (const seg of segments) {
    let count = 1, type = null, pattern = null, size = null
    const colors = []
    const rest = []
    const words = seg.split(/\s+/)
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      const lower = w.toLocaleLowerCase('tr')
      const next = (words[i + 1] || '').toLocaleLowerCase('tr')

      // "beden 42" / "beden L"
      if (SIZE_KEYWORDS.has(lower)) {
        if (words[i + 1]) { size = words[i + 1].toUpperCase(); i++ }
        continue
      }
      // "42 beden" — sayı ancak beden kelimesiyle birlikte beden olur
      if (/^\d+$/.test(w) && SIZE_KEYWORDS.has(next)) { size = w; i++; continue }
      if (!size) {
        const s = letterSize(w)
        if (s) { size = s; continue }
      }
      if (/^\d+$/.test(w)) { count = Math.min(99, Math.max(1, +w)); continue }
      if (!type) {
        const t = fuzzyFind(w, typeNames)
        if (t) { type = garmentTypes.find(x => x.name === t); continue }
      }
      const c = fuzzyFind(w, colorLabels)
      if (c && colors.length < 3 && !colors.includes(c)) { colors.push(c); continue }
      if (!pattern) {
        const p = fuzzyFind(w, patternLabels)
        if (p) { pattern = PATTERNS.find(x => x.label === p); continue }
      }
      rest.push(w)
    }
    const leftover = rest.join(' ').trim()
    if (!type && !leftover) continue // sadece renk/sayı — eklenecek bir şey yok
    entries.push({
      type_id: type ? type.id : null,
      type_name: type ? type.name : leftover,
      emoji: type?.emoji || '👕',
      count,
      colors: colors.map(label => {
        const c = COLORS.find(x => x.label === label)
        return { key: c.key, label: c.label }
      }),
      pattern: pattern ? pattern.key : 'solid',
      pattern_label: pattern ? pattern.label : 'Düz',
      brand: type && leftover ? leftover : null,
      size,
    })
  }
  return entries
}
