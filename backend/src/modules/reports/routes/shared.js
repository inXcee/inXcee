import { requireRole } from '../../../shared/auth/middleware.js'

export const mgrAccess = requireRole('campus_manager', 'shift_supervisor')

export function toCsv(headers, rows) {
  const esc = (v) => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(';') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  // ﻿ = UTF-8 BOM: Excel'in Turkce karakterleri dogru acmasi icin
  return '﻿' + [headers.join(';'), ...rows.map(r => r.map(esc).join(';'))].join('\r\n')
}
