import { Router } from 'express'
import { requireAuth, requireRole } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import {
  getCampusSummary, getCampusTimeseries,
  getBlockFaults, getBlockCleaning, getBlockRoomsWithOccupants,
  getBlockShiftTracking, getBlockCleaningTracking, getBlockCompanyTracking,
  getCampusReportRooms,
  getMaintenanceDataQuality, getUnknownShiftQueue, getOpenFaultQueue, getCleaningQueue,
  buildBlockHealth, buildCampusHealth,
} from './queries.js'
import { logger } from '../../shared/logger.js'
import { istanbulDate } from '../../shared/time.js'
import { isIsoDate } from '../../shared/validation/date.js'

export const campusMapRouter = Router()

const SETTING_KEY = 'campus_map_pins'

// Tum bloklar icin ozet — tum gorunum modlari icin gerekli veri tek seferde
campusMapRouter.get('/summary', requireAuth, (req, res) => {
  try {
    res.json({ blocks: getCampusSummary() })
  } catch (e) {
    logger.error('[campus-map.summary]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})

// Per-blok son N gun doluluk zaman serisi (sparkline + zaman slider icin)
campusMapRouter.get('/timeseries', requireAuth, (req, res) => {
  try {
    const days = Math.max(2, Math.min(30, parseInt(req.query.days) || 7))
    res.json({ days, blocks: getCampusTimeseries(days) })
  } catch (e) {
    logger.error('[campus-map.timeseries]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})

// Blok detayi — harita panelinde inline gosterim (arıza / temizlik / oda+kisi).
// Harita gibi requireAuth ile acik, ama BOLUMLER rol-duyarli: kaynak modullerin
// yetki kurallari birebir korunur, yetkisi olmayan bolum yanita hic konmaz.
const FAULT_ROLES = ['campus_manager', 'shift_supervisor', 'technical']
const CLEANING_ROLES = ['campus_manager', 'housekeeper']
const ROOM_ROLES = ['campus_manager', 'shift_supervisor']

function permissionsFor(role) {
  return {
    faults: FAULT_ROLES.includes(role),
    cleaning: CLEANING_ROLES.includes(role),
    rooms: ROOM_ROLES.includes(role),
  }
}

function requestedDate(req, res) {
  const date = req.query.date ? String(req.query.date) : istanbulDate()
  if (!isIsoDate(date)) {
    res.status(400).json({ error: 'Gecersiz tarih' })
    return null
  }
  return date
}

function campusKpis(blocks, health) {
  const values = Object.values(blocks)
  const sum = key => values.reduce((total, block) => total + Number(block[key] || 0), 0)
  return {
    ...health,
    total_blocks: values.length,
    total_rooms: sum('total_rooms'),
    total_beds: sum('total_beds'),
    occupied: sum('occupied'),
    available_beds: Math.max(0, sum('total_beds') - sum('occupied')),
    open_faults: sum('open_faults'),
    cleaning_total: sum('cleaning_total'),
    cleaning_done: sum('cleaning_done'),
    quarantine_rooms: sum('quarantine'),
    maintenance_rooms: sum('maintenance'),
    unknown_shift_count: sum('unknown_count'),
  }
}

// Yeni operasyon sozlesmesi: rol-duyarli kuyruklar ve veri kalitesi tek cagriyla gelir.
campusMapRouter.get('/operations', requireAuth, (req, res) => {
  try {
    const date = requestedDate(req, res)
    if (!date) return
    const permissions = permissionsFor(req.user.role)
    const summary = getCampusSummary(date)
    const dataQuality = getMaintenanceDataQuality()
    const unknownShifts = getUnknownShiftQueue()
    const unknownShiftCount = Object.values(summary)
      .reduce((total, block) => total + Number(block.unknown_count || 0), 0)
    const blocks = Object.fromEntries(Object.entries(summary).map(([name, block]) => [
      name,
      { ...block, ...buildBlockHealth(block) },
    ]))
    const health = buildCampusHealth(blocks, dataQuality)
    const queues = { data_quality: {} }
    if (permissions.faults) queues.data_quality.unmapped_faults = dataQuality.unmapped_faults
    if (permissions.rooms) queues.data_quality.unknown_shifts = unknownShifts
    if (permissions.faults) queues.faults = getOpenFaultQueue()
    if (permissions.cleaning) queues.cleaning = getCleaningQueue(date)

    res.json({
      generated_at: new Date().toISOString(),
      date,
      permissions,
      freshness: {
        status: 'current',
        stale_sources: [],
      },
      campus: campusKpis(blocks, health),
      blocks,
      queues,
      data_quality: {
        unmapped_fault_count: dataQuality.unmapped_fault_count,
        ...(permissions.faults ? { unmapped_faults: dataQuality.unmapped_faults } : {}),
        unknown_shift_count: unknownShiftCount,
        stale_sources: [],
      },
    })
  } catch (e) {
    logger.error('[campus-map.operations]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})

campusMapRouter.get('/block/:block/workspace', requireAuth, (req, res) => {
  try {
    const date = requestedDate(req, res)
    if (!date) return
    const block = String(req.params.block || '').trim()
    if (!block || block.length > 8) return res.status(400).json({ error: 'Gecersiz blok' })
    const summary = getCampusSummary(date)
    if (!summary[block]) return res.status(404).json({ error: 'Blok bulunamadi' })
    const permissions = permissionsFor(req.user.role)
    const unknownShifts = getUnknownShiftQueue().filter(item => item.block === block)
    const dataQuality = getMaintenanceDataQuality()
    const overview = { ...summary[block], ...buildBlockHealth(summary[block]) }
    const payload = {
      generated_at: new Date().toISOString(),
      date,
      block,
      permissions,
      freshness: { status: 'current', stale_sources: [] },
      overview,
      data_quality: {
        unmapped_fault_count: dataQuality.unmapped_fault_count,
        unknown_shift_count: unknownShifts.length,
        stale_sources: [],
      },
    }
    if (permissions.faults) payload.faults = getBlockFaults(block)
    const shiftTracking = permissions.rooms ? getBlockShiftTracking(block) : null
    const cleaningTracking = permissions.cleaning
      ? getBlockCleaningTracking(block, date, shiftTracking)
      : null
    if (permissions.cleaning) payload.cleaning = cleaningTracking
    if (permissions.rooms) {
      payload.rooms = getBlockRoomsWithOccupants(block)
      payload.shifts = shiftTracking
      payload.companies = getBlockCompanyTracking(block, shiftTracking, cleaningTracking)
    }
    res.json(payload)
  } catch (e) {
    logger.error('[campus-map.block-workspace]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})

campusMapRouter.get('/report-data', ...requireRole('campus_manager', 'shift_supervisor'), (req, res) => {
  try {
    const requestedBlock = req.query.block ? String(req.query.block).trim() : null
    if (requestedBlock && requestedBlock.length > 8) {
      return res.status(400).json({ error: 'Gecersiz blok' })
    }
    if (requestedBlock && !getCampusSummary()[requestedBlock]) {
      return res.status(404).json({ error: 'Blok bulunamadi' })
    }
    const canViewContact = req.user.role === 'campus_manager'
    const rooms = getCampusReportRooms(requestedBlock).map(room => ({
      ...room,
      occupants: room.occupants.map(person => (
        canViewContact ? person : { ...person, phone_number: undefined }
      )),
    }))
    res.json({
      generated_at: new Date().toISOString(),
      scope: requestedBlock ? 'block' : 'campus',
      block: requestedBlock,
      permissions: { contact_details: canViewContact },
      rooms,
    })
  } catch (e) {
    logger.error('[campus-map.report-data]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})

campusMapRouter.get('/block/:block/detail', requireAuth, (req, res) => {
  try {
    const block = String(req.params.block || '').trim()
    if (!block || block.length > 8) return res.status(400).json({ error: 'Gecersiz blok' })
    const can = permissionsFor(req.user.role)
    const payload = { block, can }
    if (can.faults) payload.faults = getBlockFaults(block)
    if (can.cleaning) payload.cleaning = getBlockCleaning(block)
    if (can.rooms) payload.rooms = getBlockRoomsWithOccupants(block)
    res.json(payload)
  } catch (e) {
    logger.error('[campus-map.block-detail]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})

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
    logger.error('[campus-map.get]', e)
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
    // Sanitize: { [block]: { x, y, size?, color?, label?, hidden? } }
    const clean = {}
    const COLOR_RE = /^#[0-9a-fA-F]{6}$/
    for (const [block, pos] of Object.entries(pins)) {
      if (typeof block !== 'string' || block.length > 8) continue
      if (!pos || typeof pos !== 'object') continue
      const x = Number(pos.x), y = Number(pos.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      if (x < 0 || x > 5000 || y < 0 || y > 5000) continue
      const entry = { x, y }
      if (pos.size != null) {
        const s = Number(pos.size)
        if (Number.isFinite(s) && s >= 0.4 && s <= 2.5) entry.size = s
      }
      if (typeof pos.color === 'string' && COLOR_RE.test(pos.color)) entry.color = pos.color
      if (typeof pos.label === 'string' && pos.label.length <= 20) {
        const trimmed = pos.label.trim()
        if (trimmed) entry.label = trimmed
      }
      if (pos.hidden === true) entry.hidden = true
      clean[block] = entry
    }
    const db = getDB()
    db.prepare(`
      INSERT INTO system_settings(key, value, updated_at)
      VALUES(?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `).run(SETTING_KEY, JSON.stringify(clean))
    res.json({ ok: true, count: Object.keys(clean).length })
  } catch (e) {
    logger.error('[campus-map.put]', e)
    res.status(500).json({ error: 'Sunucu hatasi' })
  }
})
