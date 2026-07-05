// LaundryHub ortak sabitleri ve yardımcıları — T1 split ile ayrıldı
export const COLOR_MAP = {
  'Beyaz': '#f0f0f0', 'Siyah': '#222', 'Gri': '#888',
  'Lacivert': '#1a2e5e', 'Mavi': '#2563eb', 'Açık Mavi': '#7ec8e3',
  'Kırmızı': '#dc2626', 'Yeşil': '#16a34a', 'Sarı': '#eab308',
  'Turuncu': '#f97316', 'Mor': '#7c3aed', 'Pembe': '#ec4899',
  'Bej': '#d4b896', 'Kahve': '#78350f',
}

export const GARMENT_COLOR_HEX = {
  white: '#f8fafc', black: '#0f172a', gray: '#94a3b8', navy: '#1d4ed8',
  blue: '#3b82f6', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
  orange: '#ea580c', purple: '#7c3aed', pink: '#db2777', brown: '#92400e', charcoal: '#4b5563',
}

export const FILTERS = [
  { key: 'all',     label: 'Tümü',    dot: null },
  { key: 'dirty',   label: 'Sepet',   dot: 'var(--accent)' },
  { key: 'washing', label: 'Yıkama',  dot: 'var(--blue)' },
  { key: 'ready',   label: 'Hazır',   dot: 'var(--green)' },
  { key: 'urgent',  label: 'Acil',    dot: 'var(--red)' },
  { key: 'sla',     label: 'SLA',     dot: 'var(--red)' },
  { key: 'lost',    label: 'Kayıp',   dot: 'var(--text3)' },
]

export function waLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('0') ? '90' + digits.slice(1) : digits
  return `https://wa.me/${normalized}`
}
