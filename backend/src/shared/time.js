const ISTANBUL_DATE_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function istanbulDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError('Gecersiz tarih')
  return ISTANBUL_DATE_FORMATTER.format(date)
}
