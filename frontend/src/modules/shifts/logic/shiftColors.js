// Vardiya renk kaynağı — TEK NOKTA. Ekran (shared.jsx shiftColor/deptColor) ve Excel
// (scheduleExcelExport, puantaj föyü) aynı hex'i kullanır → ekran = Excel.
// color_class (Tailwind) → 6 haneli hex. Bilinmeyen sınıf sessizce GRİ'ye düşmez;
// deterministik hash ile sabit bir renk atanır (aynı sınıf her zaman aynı renk).

const CLASS_HEX = {
  // slate/gray
  'bg-slate-500': '64748B', 'bg-slate-600': '475569', 'bg-gray-500': '6B7280', 'bg-gray-600': '4B5563',
  // blue
  'bg-blue-400': '60A5FA', 'bg-blue-500': '3B82F6', 'bg-blue-600': '2563EB',
  // indigo
  'bg-indigo-400': '818CF8', 'bg-indigo-500': '6366F1', 'bg-indigo-600': '4F46E5',
  // green / emerald / lime
  'bg-green-400': '4ADE80', 'bg-green-500': '22C55E', 'bg-green-600': '16A34A',
  'bg-emerald-500': '10B981', 'bg-lime-500': '84CC16', 'bg-lime-600': '65A30D',
  // teal / cyan
  'bg-teal-500': '14B8A6', 'bg-teal-600': '0D9488', 'bg-cyan-500': '06B6D4', 'bg-cyan-600': '0891B2',
  // red / rose
  'bg-red-500': 'EF4444', 'bg-red-600': 'DC2626', 'bg-rose-500': 'F43F5E',
  // orange / amber / yellow
  'bg-orange-400': 'FB923C', 'bg-orange-500': 'F97316', 'bg-amber-500': 'F59E0B',
  'bg-yellow-500': 'EAB308', 'bg-yellow-600': 'CA8A04',
  // purple / violet / fuchsia / pink
  'bg-purple-400': 'C084FC', 'bg-purple-500': 'A855F7', 'bg-purple-600': '9333EA',
  'bg-violet-500': '8B5CF6', 'bg-fuchsia-500': 'D946EF', 'bg-pink-500': 'EC4899', 'bg-pink-600': 'DB2777',
}

// Bilinmeyen sınıflar için deterministik palet (gri değil, canlı ve ayırt edici)
const FALLBACK_PALETTE = ['3B82F6', 'F59E0B', '10B981', 'EF4444', '8B5CF6', 'EC4899', '14B8A6', 'F97316', '6366F1', '84CC16', '06B6D4', 'A855F7']

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// color_class → hex (# yok). Boş/null → nötr slate.
export function classHex(colorClass) {
  if (!colorClass) return '64748B'
  if (CLASS_HEX[colorClass]) return CLASS_HEX[colorClass]
  return FALLBACK_PALETTE[hashStr(String(colorClass)) % FALLBACK_PALETTE.length]
}
export const shiftHex = classHex
export const deptHex = classHex

// hex (6 hane, # opsiyonel) → rgba(css) — ekran dolgu/metin rengi için
export function hexToRgba(hex, alpha = 1) {
  const clean = String(hex || '64748B').replace('#', '')
  const n = parseInt(clean, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

// İzin türü → hex (shared.jsx LEAVE_CELL ile hizalı)
const LEAVE_HEX = {
  annual: '14B8A6', sick: 'F97316', emergency: 'F59E0B', maternity: 'EC4899',
  paternity: '3B82F6', marriage: 'A855F7', bereavement: '64748B', unpaid: '64748B',
}
export function leaveHex(type) { return LEAVE_HEX[type] || '14B8A6' }

// Puantaj föyü kodu → hex (puantajFoyu.js CODE_META ile hizalı)
const CODE_HEX = {
  N: '22C55E', h: '14B8A6', r: 'F97316', 'üi': '64748B', yi: '3B82F6',
  i: 'A78BFA', Y: 'EF4444', P: '94A3B8',
  // çizelge kısa kodları
  OFF: '8B5CF6', I: '14B8A6', YOK: 'DC2626',
}
export function codeHex(code) { return CODE_HEX[code] || '64748B' }
