import { unitLabel } from './waterUnits.js'

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

export function movementTime(value) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export function shiftIsoDay(iso, delta) {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + delta)
  return isoDate(date)
}

export const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`

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
