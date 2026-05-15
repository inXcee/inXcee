import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import * as svc from './service.js'
import * as q from './queries.js'
import { getDB } from '../../shared/db/index.js'

export const bulkActionsRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

function readFilters(req) {
  return {
    block: req.query.block || null,
    floor: req.query.floor ?? null,
    company: req.query.company || null,
    company_id: req.query.company_id || null,
    q: req.query.q || null,
    shift_type: req.query.shift_type || null,
    gender: req.query.gender || null,
    check_in_from: req.query.check_in_from || null,
    check_in_to: req.query.check_in_to || null,
    is_blacklisted: req.query.is_blacklisted ?? null,
    has_zimmet: req.query.has_zimmet ?? null,
    unassigned: req.query.unassigned ?? null,
    discipline_min: req.query.discipline_min ?? null,
    sort: req.query.sort || null,
    sort_dir: req.query.sort_dir || null,
    limit: req.query.limit || null,
  }
}

bulkActionsRouter.get('/personnel', ...mgmt, (req, res) => {
  try { res.json(svc.listActivePersonnelService(readFilters(req))) }
  catch (e) { console.error('[BulkActions]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

bulkActionsRouter.get('/stats', ...mgmt, (req, res) => {
  try { res.json(svc.listStatsService(readFilters(req))) }
  catch (e) { console.error('[BulkActions stats]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

bulkActionsRouter.get('/detail/:id', ...mgmt, (req, res) => {
  try {
    const db = getDB()
    const id = +req.params.id
    const person = db.prepare(`
      SELECT p.*, r.block, r.floor, r.room_no, ra.bed_no,
        COALESCE(s.shift_type, 'day') AS shift_type,
        c.name AS company_name
      FROM personnel p
      LEFT JOIN room_assignments ra ON ra.personnel_id=p.id AND ra.check_out_at IS NULL
      LEFT JOIN rooms r ON r.id=ra.room_id
      LEFT JOIN shifts s ON s.personnel_id=p.id
      LEFT JOIN companies c ON c.id=p.company_id
      WHERE p.id=?
    `).get(id)
    if (!person) return res.status(404).json({ error: 'Bulunamadi' })

    const zimmet = db.prepare(`
      SELECT id, item_name, quantity, created_at, returned_at, return_condition
      FROM zimmet WHERE personnel_id=? ORDER BY returned_at IS NULL DESC, created_at DESC LIMIT 50
    `).all(id)
    let discipline = []
    try {
      discipline = db.prepare(`
        SELECT dr.*, u.full_name AS created_by_name FROM discipline_records dr
        LEFT JOIN users u ON u.id=dr.created_by
        WHERE dr.personnel_id=? ORDER BY dr.created_at DESC LIMIT 50
      `).all(id)
    } catch {}
    res.json({ person, zimmet, discipline })
  } catch (e) { console.error('[Detail]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

bulkActionsRouter.get('/export', ...mgmt, (req, res) => {
  try {
    const rows = svc.listActivePersonnelService(readFilters(req))
    const headers = ['ID', 'Ad Soyad', 'TC', 'Firma', 'Meslek', 'Telefon', 'Cinsiyet', 'Blok', 'Kat', 'Oda', 'Yatak', 'Vardiya', 'Giris', 'Zimmet', 'Disiplin', 'Karaliste']
    const lines = [headers.join(';')]
    for (const r of rows) {
      lines.push([
        r.id,
        (r.full_name || '').replace(/;/g, ','),
        r.tc_no || '',
        (r.company || '').replace(/;/g, ','),
        (r.job_title || '').replace(/;/g, ','),
        r.phone_number || '',
        r.gender === 'female' ? 'K' : r.gender === 'male' ? 'E' : '',
        r.block || '', r.floor || '', r.room_no || '', r.bed_no || '',
        r.shift_type === 'night' ? 'Gece' : 'Gunduz',
        r.check_in_date ? r.check_in_date.slice(0, 10) : '',
        r.unreturned_zimmet || 0,
        r.discipline_points || 0,
        r.is_blacklisted ? 'EVET' : '',
      ].join(';'))
    }
    const csv = '﻿' + lines.join('\r\n') // BOM for Excel
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="sakinler-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(csv)
  } catch (e) { console.error('[BulkActions export]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

bulkActionsRouter.post('/checkout', ...mgmt, (req, res) => {
  const r = svc.bulkCheckoutService(req.body?.ids, req.user.id)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})

bulkActionsRouter.post('/transfer', ...mgmt, (req, res) => {
  const r = svc.bulkTransferService(
    req.body?.ids,
    { target_block: req.body?.target_block, target_room_id: req.body?.target_room_id },
    req.user.id
  )
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})

bulkActionsRouter.post('/set-shift', ...mgmt, (req, res) => {
  const r = svc.bulkSetShiftService(req.body?.ids, req.body?.shift_type, req.user.id)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})

bulkActionsRouter.post('/blacklist', ...mgmt, (req, res) => {
  const r = svc.bulkBlacklistService(req.body?.ids, req.body?.blacklisted, req.body?.reason, req.user.id)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})

bulkActionsRouter.post('/discipline', ...mgmt, (req, res) => {
  const r = svc.bulkDisciplineService(req.body?.ids, req.body?.points, req.body?.reason, req.user.id)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})

bulkActionsRouter.post('/whatsapp', ...mgmt, async (req, res) => {
  try {
    const r = await svc.bulkWhatsAppService(req.body?.ids, req.body?.message, req.user.id)
    if (r.error) return res.status(r.status).json({ error: r.error })
    res.json(r)
  } catch (e) { console.error('[Bulk WA]', e); res.status(500).json({ error: 'Sunucu hatasi' }) }
})

bulkActionsRouter.post('/set-company', ...mgmt, (req, res) => {
  const r = svc.bulkSetCompanyService(req.body?.ids, req.body?.company_id, req.user.id)
  if (r.error) return res.status(r.status).json({ error: r.error })
  res.json(r)
})
