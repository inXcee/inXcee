// Puantaj kod kayıt sistemi (migration 042) — DB'deki puantaj_codes satırlarından
// palet aksiyonları + hücre meta çözümü. Saf mantık; PuantajTab ve föy Excel kullanır.

const HEX_RE = /^[0-9a-fA-F]{6}$/

export function cleanCodeHex(value, fallback = '64748B') {
  const hex = String(value || '').replace('#', '').trim().toUpperCase()
  return HEX_RE.test(hex) ? hex : fallback
}

export function hexUi(hex) {
  const clean = cleanCodeHex(hex)
  const n = parseInt(clean, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return {
    hex: clean,
    bg: `rgba(${r},${g},${b},.18)`,
    text: `#${clean.toLowerCase()}`,
    border: `rgba(${r},${g},${b},.45)`,
  }
}

// Yerleşik durum+izin türü → eski sabit aksiyon id'leri (klavye kısayolları bunlara bağlı)
const LEGACY_ID_BY_KEY = {
  'worked:': 'worked',
  'off:': 'off',
  'on_leave:sick': 'sick',
  'on_leave:unpaid': 'unpaid',
  'on_leave:annual': 'annual',
  'on_leave:other': 'leave_other',
  'on_leave:owed': 'leave_owed',
  'absent:': 'absent',
  'scheduled:': 'scheduled',
}

export const CLEAR_ACTION = { id: 'clear', status: 'clear', code: 'sil', label: 'Kaydı sil', hint: 'Temizle', bg: 'var(--surface2)', text: 'var(--text3)', border: 'var(--border)' }

// Kod kaydı boşken (yükleniyor / eski sunucu) kullanılan varsayılanlar — 042 seed'iyle aynı.
export const DEFAULT_PUANTAJ_CODES = [
  { id: -1, code: 'N', label: 'Normal çalıştı', color_hex: '22C55E', status: 'worked', leave_type: null, sort_order: 1, is_active: 1, is_builtin: 1 },
  { id: -2, code: 'H', label: 'Hafta tatili', color_hex: '14B8A6', status: 'off', leave_type: null, sort_order: 2, is_active: 1, is_builtin: 1 },
  { id: -3, code: 'Yİ', label: 'Yıllık izin', color_hex: '3B82F6', status: 'on_leave', leave_type: 'annual', sort_order: 3, is_active: 1, is_builtin: 1 },
  { id: -4, code: 'R', label: 'Raporlu', color_hex: 'F97316', status: 'on_leave', leave_type: 'sick', sort_order: 4, is_active: 1, is_builtin: 1 },
  { id: -5, code: 'Üİ', label: 'Ücretsiz izin', color_hex: '94A3B8', status: 'on_leave', leave_type: 'unpaid', sort_order: 5, is_active: 1, is_builtin: 1 },
  { id: -6, code: 'İ', label: 'İzinli', color_hex: 'A78BFA', status: 'on_leave', leave_type: 'other', sort_order: 6, is_active: 1, is_builtin: 1 },
  { id: -7, code: 'Aİ', label: 'Alacak izin', color_hex: 'EC4899', status: 'on_leave', leave_type: 'owed', sort_order: 7, is_active: 1, is_builtin: 1 },
  { id: -8, code: 'Y', label: 'Devamsız', color_hex: 'EF4444', status: 'absent', leave_type: null, sort_order: 8, is_active: 1, is_builtin: 1 },
  { id: -9, code: 'P', label: 'Planlı', color_hex: '64748B', status: 'scheduled', leave_type: null, sort_order: 9, is_active: 1, is_builtin: 1 },
]

export function codeKey(status, leaveType) {
  return `${status}:${status === 'on_leave' ? (leaveType || '') : ''}`
}

// puantaj_codes satırları → palet aksiyonları (+ sil). Boş liste → varsayılanlar.
export function buildPuantajActions(codes) {
  const source = (codes?.length ? codes : DEFAULT_PUANTAJ_CODES).filter(c => c.is_active)
  const actions = source
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.code).localeCompare(String(b.code), 'tr'))
    .map(row => {
      const key = codeKey(row.status, row.leave_type)
      const ui = hexUi(row.color_hex)
      return {
        id: LEGACY_ID_BY_KEY[key] || `code-${row.id}`,
        codeId: row.id,
        status: row.status,
        leave_type: row.status === 'on_leave' ? (row.leave_type || null) : undefined,
        code: row.code,
        label: row.label,
        hint: row.label,
        isBuiltin: !!row.is_builtin,
        ...ui,
      }
    })
  return [...actions, CLEAR_ACTION]
}

export function buildActionIndex(actions) {
  const byId = {}
  const byKey = {}
  actions.forEach(action => {
    byId[action.id] = action
    if (action.status !== 'clear') byKey[codeKey(action.status, action.leave_type)] = action
  })
  return { byId, byKey }
}

const SUNDAY_META = { id: 'sunday', code: '', label: 'Pazar', hint: 'Kayıt yok', bg: 'rgba(240,165,0,.05)', text: 'var(--accent)', border: 'rgba(240,165,0,.16)', hex: null }
const EMPTY_META = { id: 'no_record', code: '', label: 'Kayıt yok', hint: 'Boş', bg: 'transparent', text: 'transparent', border: 'var(--border)', hex: null }
const GENERIC_LEAVE_META = { id: 'leave', code: 'İ', label: 'İzinli', hint: 'İzin', bg: 'rgba(167,139,250,.18)', text: '#a78bfa', border: 'rgba(167,139,250,.45)', hex: 'A78BFA' }

// Hücre girdisi → kod meta (kayıttan; bilinmeyen izin türü → genel İ)
export function metaForEntry(entry, isSunday, index) {
  const status = entry?.status || (isSunday ? 'sunday' : 'no_record')
  if (status === 'sunday') return SUNDAY_META
  if (status === 'no_record') return EMPTY_META
  const effective = status === 'overtime' ? 'worked' : status
  const hit = index.byKey[codeKey(effective, entry?.leave_type)]
  if (hit) return hit
  if (effective === 'on_leave') return GENERIC_LEAVE_META
  return EMPTY_META
}
