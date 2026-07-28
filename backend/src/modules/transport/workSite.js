import { getDB } from '../../shared/db/index.js'

// Filyos Dogal Gaz Isleme Tesisi — frontend zonguldakBartin.js#WORK_SITE ile ayni deger.
// Bu yalnizca VARSAYILAN; gercek konum system_settings'te saklanir ve haritadan tasinabilir.
export const DEFAULT_WORK_SITE = { lat: 41.5750, lng: 32.0264 }

export const WORK_SITE_KEY = 'transport_work_site'

export function getWorkSite() {
  const row = getDB().prepare('SELECT value FROM system_settings WHERE key=?').get(WORK_SITE_KEY)
  if (!row) return { ...DEFAULT_WORK_SITE }
  try {
    const parsed = JSON.parse(row.value)
    if (Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lng)) {
      return { lat: parsed.lat, lng: parsed.lng }
    }
  } catch { /* bozuk ayar — varsayilana don */ }
  return { ...DEFAULT_WORK_SITE }
}

export function saveWorkSite({ lat, lng }) {
  getDB().prepare(`
    INSERT INTO system_settings(key, value, updated_at)
    VALUES(?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(WORK_SITE_KEY, JSON.stringify({ lat, lng }))
}
