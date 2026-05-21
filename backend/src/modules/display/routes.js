import { Router } from 'express'
import { getDB } from '../../shared/db/index.js'
import { logger } from '../../shared/logger.js'

// Public read-only TV pano endpoint'i. Auth gerekmiyor (kampus icindeki TV icin).
// Localhost veya iç ağ icin acik — Nginx ile dis erisim kapatilmalidir.

export const displayRouter = Router()

displayRouter.get('/snapshot', (_req, res) => {
  const db = getDB()
  try {
    const occupancy = db.prepare(`
      SELECT
        SUM(r.active_beds) AS beds,
        COALESCE(SUM(cnt.c), 0) AS occupied
      FROM rooms r
      LEFT JOIN (
        SELECT room_id, COUNT(*) AS c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id
      ) cnt ON cnt.room_id=r.id
      WHERE r.status='active'
    `).get()

    const blockDist = db.prepare(`
      SELECT r.block,
        SUM(r.active_beds) AS beds,
        COALESCE(SUM(cnt.c), 0) AS occupied
      FROM rooms r
      LEFT JOIN (
        SELECT room_id, COUNT(*) AS c FROM room_assignments WHERE check_out_at IS NULL GROUP BY room_id
      ) cnt ON cnt.room_id=r.id
      WHERE r.status='active'
      GROUP BY r.block
      ORDER BY r.block
    `).all()

    const openMaintenance = db.prepare(`
      SELECT COUNT(*) AS c FROM maintenance_requests WHERE status NOT IN ('done')
    `).get().c

    const todayCheckIn = db.prepare(`
      SELECT COUNT(*) AS c FROM personnel WHERE date(check_in_date)=date('now')
    `).get().c

    const todayCheckOut = db.prepare(`
      SELECT COUNT(*) AS c FROM personnel WHERE date(check_out_date)=date('now')
    `).get().c

    let announcements = []
    try {
      announcements = db.prepare(`
        SELECT title, body, created_at FROM announcements
        WHERE (active_until IS NULL OR active_until >= date('now'))
        ORDER BY created_at DESC LIMIT 5
      `).all()
    } catch { /* announcements tablosu eski semadan yoksa atla */ }

    let activeVisitors = 0
    try {
      activeVisitors = db.prepare('SELECT COUNT(*) AS c FROM visitors WHERE check_out_at IS NULL').get().c
    } catch {}

    let upcomingDrill = null
    try {
      const ud = db.prepare("SELECT drill_type, next_drill_date FROM drills WHERE next_drill_date >= date('now') ORDER BY next_drill_date LIMIT 1").get()
      if (ud) upcomingDrill = ud
    } catch {}

    res.json({
      occupancy: {
        beds: occupancy?.beds || 0,
        occupied: occupancy?.occupied || 0,
        empty: (occupancy?.beds || 0) - (occupancy?.occupied || 0),
        rate: occupancy?.beds ? Math.round((occupancy.occupied / occupancy.beds) * 100) : 0,
      },
      blocks: blockDist,
      today: { check_in: todayCheckIn, check_out: todayCheckOut },
      open_maintenance: openMaintenance,
      active_visitors: activeVisitors,
      upcoming_drill: upcomingDrill,
      announcements,
      generated_at: new Date().toISOString(),
    })
  } catch (e) {
    logger.error('[Display]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})
