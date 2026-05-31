// "İçeridekiler" (kampüs mevcudiyeti) listesi için CSV/Excel export kolonları.
// Saf — React bağımlılığı yok, test edilebilir. PresencePage ve testler paylaşır.

export const HOLDER_LABEL = { staff: 'Personel', personnel: 'İşçi', visitor: 'Ziyaretçi' }

export function fmtTs(ts) {
  if (!ts) return '—'
  const d = new Date(ts.replace(' ', 'T'))
  return isNaN(d) ? ts : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// exportData.js sözleşmesi: [{ key, label, format?: (row) => any }]
export const PRESENCE_EXPORT_COLS = [
  { key: 'full_name', label: 'Ad', format: r => r.full_name || 'Bilinmiyor' },
  { key: 'holder_type', label: 'Tür', format: r => HOLDER_LABEL[r.holder_type] || r.holder_type },
  { key: 'since', label: 'Giriş', format: r => fmtTs(r.since) },
]

export function presenceFilename(ext) {
  return `iceridekiler-${new Date().toISOString().slice(0, 10)}.${ext}`
}
