import { Router } from 'express'
import { requireAuth, requireRole } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'

export const campusMapRouter = Router()

const SETTING_KEY = 'campus_map_pins'

// Tum giris yapmis kullanicilar haritayi okuyabilir
campusMapRouter.get('/pins', requireAuth, (req, res) => {
  try {
    const db = getDB()
    const row = db.prepare('SELECT value FROM system_settings WHERE key=?').get(SETTING_KEY)
    if (!row) return res.json({ pins: {} })
    try {
      const parsed = JSON.parse(row.value)
      res.json({ pins: parsed && typeof parsed === 'object' ? parsed : {} })
    } catch {
      res.json({ pins: {} })
    }
  } catch (e) {
    console.error('[campus-map.get]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})

// Sadece campus_manager yazabilir
campusMapRouter.put('/pins', ...requireRole('campus_manager'), (req, res) => {
  try {
    const { pins } = req.body || {}
    if (!pins || typeof pins !== 'object' || Array.isArray(pins)) {
      return res.status(400).json({ error: 'pins objesi gerekli' })
    }
    // Sanitize: sadece { [block]: { x: number, y: number } } yapisi
    const clean = {}
    for (const [block, pos] of Object.entries(pins)) {
      if (typeof block !== 'string' || block.length > 8) continue
      if (!pos || typeof pos !== 'object') continue
      const x = Number(pos.x), y = Number(pos.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      if (x < 0 || x > 5000 || y < 0 || y > 5000) continue
      clean[block] = { x, y }
    }
    const db = getDB()
    db.prepare(`
      INSERT INTO system_settings(key, value, updated_at)
      VALUES(?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `).run(SETTING_KEY, JSON.stringify(clean))
    res.json({ ok: true, count: Object.keys(clean).length })
  } catch (e) {
    console.error('[campus-map.put]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})
