const SETTINGS_CACHE_KEY = 'laundry-card-settings-v1'

export const EMPTY_LAUNDRY_CARD = Object.freeze({
  card_code: '',
  card_override_reason: '',
  verification: null,
})

export function emptyLaundryCard() {
  return { ...EMPTY_LAUNDRY_CARD }
}

export function readCachedCardSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || 'null')
    if (value && typeof value.intake_required === 'boolean' && typeof value.delivery_required === 'boolean') {
      return value
    }
  } catch {}
  return { available: false, intake_required: false, delivery_required: false }
}

export function cacheCardSettings(settings) {
  if (!settings || typeof settings.intake_required !== 'boolean' || typeof settings.delivery_required !== 'boolean') return settings
  try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings)) } catch {}
  return settings
}

export function cardRequestFields(value) {
  const fields = {}
  const code = String(value?.card_code || '').trim()
  const reason = String(value?.card_override_reason || '').trim()
  if (code) fields.card_code = code
  if (reason) fields.card_override_reason = reason
  return fields
}

export function cardGateReady({ required, online, value }) {
  if (!required) return true
  const code = String(value?.card_code || '').trim()
  if (code) {
    if (!online) return true
    return Boolean(value?.verification?.allowed)
  }
  const reason = String(value?.card_override_reason || '').trim()
  return reason.length >= 3
}

export function cardGateMessage({ required, online, value }) {
  if (!required || cardGateReady({ required, online, value })) return null
  if (String(value?.card_code || '').trim() && online) return 'Kart sunucuda doğrulanmadan işleme devam edilemez'
  return 'Çamaşır kartını okutun veya en az 3 karakterlik gerekçe yazın'
}

export function extractNfcCode(event) {
  const serial = String(event?.serialNumber || '').trim()
  if (serial) return serial
  for (const record of event?.message?.records || []) {
    try {
      if (record.data) return new TextDecoder(record.encoding || 'utf-8').decode(record.data).trim()
    } catch {}
  }
  return ''
}

export async function readLaundryNfc(onCode, { signal } = {}) {
  if (typeof globalThis.NDEFReader !== 'function') throw new Error('Web NFC bu cihazda desteklenmiyor')
  const reader = new globalThis.NDEFReader()
  await reader.scan({ signal })
  reader.addEventListener('reading', event => {
    const code = extractNfcCode(event)
    if (code) onCode(code)
  }, { once: true })
  return reader
}
