import { requireRole } from '../../../shared/auth/middleware.js'

export const mgrAccess = requireRole('campus_manager', 'shift_supervisor')

// Excel/LibreOffice '=', '+', '-', '@' (ve TAB/CR) ile başlayan hücreyi formül
// olarak çalıştırır (CSV/formül enjeksiyonu — OWASP). Kullanıcının yazdığı bir ad
// "=HYPERLINK(...)" ise rapor açılınca çalışırdı. Metin hücresinin başına ' eklenir;
// sayılar ve telefonlar dokunulmadan kalır.
const FORMULA_START = /^[=+\-@\t\r]/
export function csvSafe(v) {
  if (typeof v !== 'string') return v
  if (v.length < 2 || !FORMULA_START.test(v)) return v
  // Sayı ve telefon (+90 555 123 45 67) gibi yalnız rakam/boşluk/ayraç içeren değerler
  // fonksiyon ya da hücre referansı taşıyamaz; olduğu gibi kalır.
  if (/^[+-]?[\d\s().,-]+$/.test(v)) return v
  return `'${v}`
}

// ?month=YYYY-MM doğrulaması. Geçersizse null → 400.
export function parseMonth(value, fallback) {
  if (value == null || value === '') return fallback
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value)) ? String(value) : null
}

export function toCsv(headers, rows) {
  const esc = (raw) => {
    const v = csvSafe(raw)
    if (v == null) return ''
    const s = String(v)
    if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  // ﻿ = UTF-8 BOM: Excel'in Turkce karakterleri dogru acmasi icin
  return '﻿' + [headers.join(';'), ...rows.map(r => r.map(esc).join(';'))].join('\r\n')
}
