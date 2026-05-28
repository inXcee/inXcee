import { Router } from 'express'
import { getDB } from '../../shared/db/index.js'
import { getKPI } from '../dashboard/queries.js'
import { memoize } from '../../shared/middleware/memo.js'
import { logger } from '../../shared/logger.js'

// Login ekranı için auth GEREKTİRMEYEN güvenli toplu sayılar.
// SADECE aggregate sayılar döner — isim/oda/kişi gibi hassas (PII) veri YOK.
// 30sn memoize (login öncesi DB'yi yormasın).
const _publicExtra = () => {
  const db = getDB()
  const active_staff = db.prepare("SELECT COUNT(*) as c FROM staff WHERE is_active = 1").get().c
  const departments = db.prepare("SELECT COUNT(*) as c FROM departments").get().c
  return { active_staff, departments }
}
const getPublicExtra = memoize(_publicExtra, 30_000)

export const publicRouter = Router()

publicRouter.get('/stats', (req, res) => {
  try {
    const k = getKPI()
    const e = getPublicExtra()
    res.json({
      beds_total:    k.total_beds,
      beds_occupied: k.occupied,
      occupancy_pct: k.occupancy_pct,
      open_faults:   k.open_maintenance,
      active_staff:  e.active_staff,
      departments:   e.departments,
    })
  } catch (err) {
    logger.error('[public stats]', err)
    res.status(500).json({ error: 'Sunucu hatası' })
  }
})
