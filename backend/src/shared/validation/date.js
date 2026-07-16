const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_MONTH_PATTERN = /^\d{4}-\d{2}$/
const TIME_PATTERN = /^\d{2}:\d{2}$/

export function isIsoDate(value) {
  const normalized = String(value || '')
  if (!ISO_DATE_PATTERN.test(normalized)) return false
  const date = new Date(`${normalized}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === normalized
}

export function isIsoMonth(value) {
  const normalized = String(value || '')
  return ISO_MONTH_PATTERN.test(normalized) && isIsoDate(`${normalized}-01`)
}

export function isTime(value) {
  const normalized = String(value || '')
  if (!TIME_PATTERN.test(normalized)) return false
  const [hours, minutes] = normalized.split(':').map(Number)
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}
