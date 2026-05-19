export const PRESET_LABELS = { '7': 'SON 7 GÜN', '30': 'SON 30 GÜN', '90': 'SON 90 GÜN' }
export const MAX_DAYS = 90
const DEFAULT_RANGE = '30'

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10)

export function parseRange(rawRange, rawFrom, rawTo) {
  if (rawRange === 'custom') {
    if (rawFrom && rawTo && rawFrom <= rawTo) {
      return { range: 'custom', from: rawFrom, to: rawTo, isCustom: true }
    }
    return { range: DEFAULT_RANGE, from: null, to: null, isCustom: false }
  }
  if (PRESET_LABELS[rawRange]) {
    return { range: rawRange, from: null, to: null, isCustom: false }
  }
  return { range: DEFAULT_RANGE, from: null, to: null, isCustom: false }
}

export function computeRange(parsed, nowMs = Date.now()) {
  if (parsed.isCustom) {
    const diffDays = Math.ceil((new Date(parsed.to) - new Date(parsed.from)) / 86400000) + 1
    const days = Math.max(1, Math.min(MAX_DAYS, diffDays))
    return {
      range: 'custom',
      isCustom: true,
      from: parsed.from,
      to: parsed.to,
      days,
      label: `${parsed.from} → ${parsed.to}`,
    }
  }
  const days = Number(parsed.range)
  const to = isoDate(nowMs)
  const from = isoDate(nowMs - (days - 1) * 86400000)
  return {
    range: parsed.range,
    isCustom: false,
    from,
    to,
    days,
    label: PRESET_LABELS[parsed.range],
  }
}
