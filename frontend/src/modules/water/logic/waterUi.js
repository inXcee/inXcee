import { unitLabel } from './waterUnits.js'
import { safeValue } from '../../../shared/utils/exportData.js'

export const todayStr = (date = new Date()) => date.toLocaleDateString('sv-SE')

export const nf = value => new Intl.NumberFormat('tr-TR').format(value || 0)

export function calcText(product, parsed) {
  if (!parsed?.valid) return ''
  const baseLabel = product?.unit_label || 'adet'
  return `${nf(parsed.input_qty)} ${unitLabel(parsed.input_unit)} = ${nf(parsed.base)} ${baseLabel}`
}

export const isoDate = date => date.toLocaleDateString('sv-SE')

export function dateRange(from, to) {
  if (!from || !to) return []
  const output = []
  const date = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (date <= end) {
    output.push(isoDate(date))
    date.setDate(date.getDate() + 1)
  }
  return output
}

export const dayShort = iso => new Date(`${iso}T00:00:00`)
  .toLocaleDateString('tr-TR', { weekday: 'short' })

export const dayLong = iso => new Date(`${iso}T00:00:00`)
  .toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

// SQLite CURRENT_TIMESTAMP UTC'dir ve bölge eki taşımaz ("2026-07-15 06:05:00"). Ek yoksa UTC say;
// aksi hâlde tarayıcı yerel saat sanar ve İstanbul'da kayıt saati 3 saat geride görünür.
export function parseServerTimestamp(value) {
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00`)
  const iso = text.replace(' ', 'T')
  return new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(iso) ? iso : `${iso}Z`)
}

export function movementTime(value) {
  if (!value) return ''
  const date = parseServerTimestamp(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// Sunucu zaman damgasını (UTC) kullanıcının yerel gün+saatine çevirir; bozuksa ham değeri döndürür.
export function serverDateTime(value) {
  if (!value) return ''
  const date = parseServerTimestamp(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function shiftIsoDay(iso, delta) {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + delta)
  return isoDate(date)
}

export const csvCell = value => `"${safeValue(value).replace(/"/g, '""')}"`

export function buildCsvText(headers, rows) {
  return [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\n')
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([`\ufeff${buildCsvText(headers, rows)}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
