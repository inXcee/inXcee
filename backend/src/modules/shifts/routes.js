import { Router } from 'express'
import fs from 'fs'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { paginate } from '../../shared/paginate.js'
import { logger } from '../../shared/logger.js'
import {
  departmentsService, shiftDefinitionsService, scheduleService, bulkAssignService,
  scheduleSegmentsService, createScheduleSegmentService, updateScheduleSegmentService, deleteScheduleSegmentService,
  workLocationsService, createWorkLocationService, updateWorkLocationService, deleteWorkLocationService,
  staffRolesService, createStaffRoleService, updateStaffRoleService, deleteStaffRoleService, scheduleBreakdownService, breakdownAssigneesService,
  staffStatusService, createLeaveService, approveLeaveService, leaveListService,
  leaveBalanceService, createOvertimeService, updateOvertimeService, deleteOvertimeService, overtimeListService, overtimeSummaryService, overtimeDayService, puantajService,
  checkInService, checkOutService, attendanceListService, statisticsService, coverageService, departmentSummaryService,
  coverageRulesService, createCoverageRuleService, updateCoverageRuleService, deleteCoverageRuleService, scheduleCandidatesService,
  createDepartmentService, updateDepartmentService, deleteDepartmentService, assignDeptService,
  createShiftDefService, updateShiftDefService, deleteShiftDefService,
  cancelLeaveService, createSwapService, swapListService, acceptSwapService, approveSwapService, rejectSwapService,
  copyWeekService, rotationService, searchStaffService, deleteScheduleService,
  rotationTemplatesService, createRotationTemplateService, deleteRotationTemplateService,
  rotationPreviewService, rotationApplyService,
  periodLocksService, lockPeriodService, unlockPeriodService,
  puantajApprovalService, submitPuantajPeriodService, puantajApprovalOverviewService,
  puantajCodesService, createPuantajCodeService, updatePuantajCodeService, deletePuantajCodeService,
  updatePuantajDayApprovalService, updatePuantajPeriodApprovalService,
  staffDetailService,
  staffListService, staffGetService, staffCreateService, staffUpdateService, staffDeleteService,
  staffAssignmentsService, createStaffAssignmentService, staffDataQualityService,
  puantajCsvService, puantajDaysService, staffDayBreakdownService, payslipService, bankTransferCsvService,
  attendanceEventService, attendanceEventsService, reconcileAttendanceService,
  attendanceExceptionsService, updateAttendanceExceptionService
} from './service.js'
import PDFDocument from 'pdfkit'
import {
  checkConflicts, listHolidays, createHoliday, updateHoliday, deleteHoliday,
  getPayrollExport, getCombinedAbsences,
  listDeductions, createDeduction, deleteDeduction, getPayrollDetailed,
  upsertPuantajDayDetail,
} from './queries.js'
import { importSchedule, listImportBatches, undoImportBatch } from './import.js'
import { importScheduleSchema } from './schemas.js'
import { validate } from '../../shared/middleware/validate.js'
import { logAudit } from '../../shared/audit.js'
import { documentUpload, verifyDocumentMagicBytes } from '../../shared/uploads/middleware.js'

export const shiftsRouter = Router()

const managerOrSupervisor = requireRole('campus_manager', 'shift_supervisor')
const managerOnly = requireRole('campus_manager')
const allStaff = [requireAuth]

// ── Staff CRUD — Personel bilgileri (maaş, TC, adres) sadece yönetim rollerine ──
shiftsRouter.get('/staff', ...managerOrSupervisor, (req, res) => {
  if (req.query.page || req.query.limit) {
    const { page, limit, offset } = paginate(req)
    const db = getDB()
    const total = db.prepare('SELECT COUNT(*) as c FROM staff').get().c
    const data = staffListService({ ...req.query, _limit: limit, _offset: offset })
    return res.json({ data, total, page, limit })
  }
  res.json(staffListService(req.query))
})

shiftsRouter.get('/staff/search', ...managerOrSupervisor, (req, res) => {
  res.json(searchStaffService(req.query.q))
})

shiftsRouter.get('/staff/quality', ...managerOrSupervisor, (req, res) => {
  res.json(staffDataQualityService())
})

shiftsRouter.get('/staff/:id', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(staffGetService(req.params.id))
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

shiftsRouter.get('/staff/:id/detail', ...allStaff, (req, res) => {
  try {
    res.json(staffDetailService(req.params.id))
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

shiftsRouter.post('/staff', ...managerOrSupervisor, (req, res) => {
  try {
    const id = staffCreateService(req.body, req.user.id)
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.put('/staff/:id', ...managerOrSupervisor, (req, res) => {
  try {
    staffUpdateService(req.params.id, req.body, req.user.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.delete('/staff/:id', ...managerOrSupervisor, (req, res) => {
  try {
    staffDeleteService(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── Departments & definitions ──
shiftsRouter.get('/departments', ...allStaff, (req, res) => {
  res.json(departmentsService())
})

shiftsRouter.get('/departments/summary', ...allStaff, (req, res) => {
  res.json(departmentSummaryService())
})

shiftsRouter.get('/definitions', ...allStaff, (req, res) => {
  res.json(shiftDefinitionsService())
})

shiftsRouter.get('/work-locations', ...allStaff, (req, res) => {
  try { res.json(workLocationsService(req.query)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.post('/work-locations', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createWorkLocationService(req.body)
    logAudit(req.user.id, 'work_location_create', 'shifts', id, req.body.name)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.put('/work-locations/:id', ...managerOrSupervisor, (req, res) => {
  try {
    updateWorkLocationService(+req.params.id, req.body)
    logAudit(req.user.id, 'work_location_update', 'shifts', +req.params.id, req.body.name || '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/work-locations/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteWorkLocationService(+req.params.id)
    logAudit(req.user.id, 'work_location_delete', 'shifts', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.get('/roles', ...allStaff, (req, res) => {
  try { res.json(staffRolesService(req.query)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.post('/roles', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createStaffRoleService(req.body)
    logAudit(req.user.id, 'staff_role_create', 'shifts', id, req.body.name)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.put('/roles/:id', ...managerOrSupervisor, (req, res) => {
  try {
    updateStaffRoleService(+req.params.id, req.body)
    logAudit(req.user.id, 'staff_role_update', 'shifts', +req.params.id, req.body.name || '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/roles/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteStaffRoleService(+req.params.id)
    logAudit(req.user.id, 'staff_role_delete', 'shifts', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Schedule ──
shiftsRouter.get('/schedule', ...allStaff, (req, res) => {
  const { week, week_end, dept_id } = req.query
  if (!week) return res.status(400).json({ error: 'week parametresi gerekli (YYYY-MM-DD)' })
  const weekStart = week
  const weekEnd = week_end || (() => {
    const d = new Date(week)
    d.setDate(d.getDate() + 6)
    return d.toISOString().split('T')[0]
  })()
  res.json(scheduleService(weekStart, weekEnd, dept_id || null))
})

shiftsRouter.post('/schedule', ...managerOrSupervisor, (req, res) => {
  try {
    const result = bulkAssignService(req.body.entries, req.user, {
      overrideLeave: req.body.override_leave === true,
      overrideReason: req.body.override_reason,
    })
    if (result.leaveOverride) {
      logAudit(req.user.id, 'schedule_leave_override', 'shifts', null,
        `${result.warnings.length} kayit | ${result.leaveOverride.reason}`)
    }
    res.json({
      ok: true,
      warnings: result?.warnings || [],
      approvalsReset: result?.approvalsReset || 0,
      leaveOverride: result?.leaveOverride || null,
    })
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message, ...(e.details || {}) })
  }
})

shiftsRouter.get('/schedule/:staffId/:date/segments', ...allStaff, (req, res) => {
  try { res.json(scheduleSegmentsService(+req.params.staffId, req.params.date)) }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.post('/schedule/segments', ...managerOrSupervisor, (req, res) => {
  try {
    const result = createScheduleSegmentService(req.body, req.user)
    logAudit(req.user.id, 'schedule_segment_create', 'shifts', result.row.id,
      `${req.body.staff_id} | ${req.body.work_date} | ${result.row.start_time}-${result.row.end_time}`)
    res.status(201).json(result)
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message, ...(e.details || {}) }) }
})

shiftsRouter.put('/schedule/segments/:id', ...managerOrSupervisor, (req, res) => {
  try {
    const row = updateScheduleSegmentService(+req.params.id, req.body, req.user)
    logAudit(req.user.id, 'schedule_segment_update', 'shifts', row.id, `${row.start_time}-${row.end_time}`)
    res.json(row)
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message, ...(e.details || {}) }) }
})

shiftsRouter.delete('/schedule/segments/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteScheduleSegmentService(+req.params.id, req.user)
    logAudit(req.user.id, 'schedule_segment_delete', 'shifts', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.get('/schedule/candidates', ...allStaff, (req, res) => {
  try { res.json(scheduleCandidatesService(req.query)) }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.get('/breakdown', ...allStaff, (req, res) => {
  try { res.json(scheduleBreakdownService({ from: req.query.from, to: req.query.to })) }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.get('/breakdown/assignees', ...allStaff, (req, res) => {
  try { res.json(breakdownAssigneesService({ date: req.query.date, dimension: req.query.dimension, value: req.query.value })) }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

// ── Excel çizelge içe aktarımı (önizleme + uygula) ──
// ?dryRun=1 → hiçbir şey yazmaz, sadece uzlaştırma raporu döndürür (önizleme).
shiftsRouter.post('/import', ...managerOrSupervisor, validate(importScheduleSchema), (req, res) => {
  try {
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true'
    const report = importSchedule(req.validated, req.user.id, {
      dryRun, createMissing: true,
      excludeDepts: req.validated.excludeDepts || [],
      mappings: req.validated.mappings || {},
    })
    if (!dryRun) {
      logAudit(req.user.id, 'schedule_import', 'shifts', null,
        `${report.scheduleEntries} kayıt · ${report.staff.created.length} yeni personel · ${report.depts.created.length} yeni departman`)
    }
    res.json(report)
  } catch (e) {
    logger.error('[shifts/import]', e)
    res.status(400).json({ error: e.message })
  }
})

// ── İçe aktarım oturumları (geri-alma için) ──
shiftsRouter.get('/import/batches', ...managerOrSupervisor, (req, res) => {
  try { res.json(listImportBatches(req.query.limit ? +req.query.limit : 20)) }
  catch (e) { logger.error('[shifts/import/batches]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

shiftsRouter.post('/import/batches/:id/undo', ...managerOrSupervisor, (req, res) => {
  try {
    const result = undoImportBatch(+req.params.id)
    logAudit(req.user.id, 'schedule_import_undo', 'shifts', +req.params.id,
      `${result.scheduleDeleted} silindi · ${result.scheduleRestored} geri yüklendi · ${result.staffDeleted} personel silindi`)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── H4 V1: Çakışma kontrol ──
shiftsRouter.post('/schedule/check-conflicts', ...managerOrSupervisor, (req, res) => {
  try {
    const conflicts = checkConflicts(req.body?.entries || [])
    res.json({ conflicts, has_conflicts: conflicts.length > 0 })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── H4 V3: Resmi tatil tablosu ──
shiftsRouter.get('/holidays', ...allStaff, (req, res) => {
  try { res.json(listHolidays({ year: req.query.year })) }
  catch (e) { logger.error('[holidays/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

shiftsRouter.post('/holidays', ...managerOrSupervisor, (req, res) => {
  try {
    if (!req.body?.date || !req.body?.name) return res.status(400).json({ error: 'date ve name gerekli' })
    const id = createHoliday(req.body)
    logAudit(req.user.id, 'holiday_create', 'shifts', id, `${req.body.date} ${req.body.name}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.put('/holidays/:id', ...managerOrSupervisor, (req, res) => {
  try { updateHoliday(+req.params.id, req.body); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/holidays/:id', ...managerOrSupervisor, (req, res) => {
  try { deleteHoliday(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── H4 V7: Bordro export ──
shiftsRouter.get('/payroll-export', ...managerOrSupervisor, (req, res) => {
  try {
    const ym = req.query.month || new Date().toISOString().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'month YYYY-MM formatında olmalı' })
    res.json({ month: ym, rows: getPayrollExport(ym) })
  } catch (e) { logger.error('[payroll]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── H8 B3: Kesinti CRUD ──
shiftsRouter.get('/deductions', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(listDeductions({
      period: req.query.period,
      staffId: req.query.staff_id ? +req.query.staff_id : null,
    }))
  } catch (e) { logger.error('[deductions/list]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

shiftsRouter.post('/deductions', ...managerOrSupervisor, (req, res) => {
  try {
    const { staff_id, period, kind, amount } = req.body || {}
    if (!staff_id || !period || !kind || amount == null) {
      return res.status(400).json({ error: 'staff_id, period, kind, amount gerekli' })
    }
    if (!['damage', 'discipline', 'late', 'advance', 'tax', 'other'].includes(kind)) {
      return res.status(400).json({ error: 'Geçersiz kind' })
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ error: 'period YYYY-MM formatında olmalı' })
    }
    const id = createDeduction(req.body, req.user.id)
    logAudit(req.user.id, 'deduction_create', 'payroll', id, `${kind} ${amount}₺ ${period}`)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/deductions/:id', ...managerOrSupervisor, (req, res) => {
  try { deleteDeduction(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── H8 — Detaylı bordro (B1 vardiya→gün, B2 mesai+çarpan, B3 kesinti, B5 SGK gün) ──
shiftsRouter.get('/payroll-detailed', ...managerOrSupervisor, (req, res) => {
  try {
    const ym = req.query.month || new Date().toISOString().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'month YYYY-MM formatında olmalı' })
    res.json({ month: ym, rows: getPayrollDetailed(ym) })
  } catch (e) { logger.error('[payroll-detailed]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── L2: Banka toplu ödeme dosyası (CSV) ──
shiftsRouter.get('/bank-transfer', ...managerOrSupervisor, (req, res) => {
  try {
    const ym = req.query.month || new Date().toISOString().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(ym)) return res.status(400).json({ error: 'month YYYY-MM formatında olmalı' })
    const csv = bankTransferCsvService(ym)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="banka-transfer-${ym}.csv"`)
    logAudit(req.user.id, 'bank_transfer_csv', 'payroll', null, ym)
    res.send(csv)
  } catch (e) {
    console.error('[bank-transfer]', e)
    res.status(e.statusCode || 500).json({ error: e.message || 'Sunucu hatası' })
  }
})

// ── L1: Kişi bazlı maaş bordrosu PDF (TR standart format) ──
const DEDUCTION_KIND_TR = {
  damage: 'Hasar kesintisi', discipline: 'Disiplin kesintisi', late: 'Gec gelme kesintisi',
  advance: 'Avans mahsubu', tax: 'Vergi kesintisi', other: 'Diger kesinti',
}

shiftsRouter.get('/payslip/:staffId/pdf', ...managerOrSupervisor, (req, res) => {
  try {
    const ym = req.query.month || new Date().toISOString().slice(0, 7)
    const p = payslipService(req.params.staffId, ym)
    const fmt = (n) => (n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    res.setHeader('Content-Type', 'application/pdf')
    const safeName = (p.full_name || 'personel')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50)
    res.setHeader('Content-Disposition', `attachment; filename="bordro-${ym}-${safeName}.pdf"`)
    doc.pipe(res)

    // Başlık
    doc.fontSize(16).font('Helvetica-Bold').text('MAAS BORDROSU', { align: 'center' })
    doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
      .text(`Donem: ${ym}  |  Belge No: BRD-${ym}-${p.id}`, { align: 'center' })
    doc.fillColor('#000').moveDown(1.2)

    // Personel bilgileri
    doc.fontSize(11).font('Helvetica-Bold').text('Personel Bilgileri')
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e5e7eb').stroke().strokeColor('#000')
    doc.font('Helvetica').fontSize(9).moveDown(0.4)
    const infoY = doc.y
    doc.text(`Ad Soyad: ${p.full_name}`, 50, infoY)
    doc.text(`T.C. Kimlik No: ${p.tc_no || '—'}`, 300, infoY)
    doc.text(`Departman: ${p.dept_name || '—'}`, 50, infoY + 14)
    doc.text(`Pozisyon: ${p.position || '—'}`, 300, infoY + 14)
    doc.text(`Aylik Brut Ucret: ${fmt(p.salary)} TL`, 50, infoY + 28)
    doc.text(`Gunluk Ucret: ${fmt(p.daily_rate)} TL`, 300, infoY + 28)
    doc.y = infoY + 46

    // Çalışma özeti
    doc.fontSize(11).font('Helvetica-Bold').text('Calisma Ozeti', 50)
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e5e7eb').stroke().strokeColor('#000')
    doc.font('Helvetica').fontSize(9).moveDown(0.4)
    const sumY = doc.y
    doc.text(`Calisilan Gun: ${p.worked_days}`, 50, sumY)
    doc.text(`Ucretli Izin: ${(p.annual_leave_days || 0) + (p.emergency_leave_days || 0)} gun`, 175, sumY)
    doc.text(`Devamsiz: ${p.absent_days} gun`, 320, sumY)
    doc.text(`Fazla Mesai: ${p.overtime_hours} saat`, 430, sumY)
    doc.y = sumY + 22

    // Kazançlar / kesintiler tablosu
    const line = (label, value, opts = {}) => {
      if (doc.y > 720) { doc.addPage(); doc.y = 50 }
      const y = doc.y
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .fillColor(opts.color || '#000')
        .text(label, 60, y, { width: 330 })
        .text(`${fmt(value)} TL`, 390, y, { width: 145, align: 'right' })
      doc.fillColor('#000')
      doc.y = y + 15
    }

    doc.fontSize(11).font('Helvetica-Bold').text('Kazanclar', 50)
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e5e7eb').stroke().strokeColor('#000')
    doc.moveDown(0.4)
    line('Normal Calisma Ucreti', p.base_pay)
    if (p.weekly_off_pay > 0) line('Hafta Tatili Ucreti', p.weekly_off_pay)
    if (p.leave_pay > 0) line('Ucretli Izin Karsiligi', p.leave_pay)
    if (p.overtime_pay > 0) line('Fazla Mesai Ucreti (x1.5)', p.overtime_pay)
    line('BRUT TOPLAM', p.gross, { bold: true })
    doc.moveDown(0.5)

    doc.fontSize(11).font('Helvetica-Bold').text('Yasal Kesintiler', 50)
    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e5e7eb').stroke().strokeColor('#000')
    doc.moveDown(0.4)
    line('SGK Isci Payi (%14)', p.ssi_worker, { color: '#b91c1c' })
    line('Issizlik Sigortasi Isci Payi (%1)', p.unemployment_worker, { color: '#b91c1c' })
    line('Gelir Vergisi (kumulatif dilim)', p.income_tax, { color: '#b91c1c' })
    line('Damga Vergisi (binde 7,59)', p.stamp_tax, { color: '#b91c1c' })
    line('Yasal Kesinti Toplami', p.total_deductions, { bold: true, color: '#b91c1c' })
    doc.moveDown(0.5)

    if (p.deduction_items.length) {
      doc.fontSize(11).font('Helvetica-Bold').text('Ozel Kesintiler', 50)
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#e5e7eb').stroke().strokeColor('#000')
      doc.moveDown(0.4)
      p.deduction_items.forEach(d => {
        const label = DEDUCTION_KIND_TR[d.kind] || d.kind
        line(`${label}${d.description ? ' — ' + d.description : ''}`, d.amount, { color: '#b91c1c' })
      })
      line('Ozel Kesinti Toplami', p.other_deductions, { bold: true, color: '#b91c1c' })
      doc.moveDown(0.5)
    }

    // Net ödenen
    if (doc.y > 660) { doc.addPage(); doc.y = 50 }
    const netY = doc.y + 6
    doc.rect(50, netY, 495, 32).fillAndStroke('#f0fdf4', '#16a34a')
    doc.fillColor('#166534').fontSize(12).font('Helvetica-Bold')
      .text('NET ODENEN', 60, netY + 10)
      .text(`${fmt(p.net_payable)} TL`, 380, netY + 10, { width: 155, align: 'right' })
    doc.fillColor('#000').font('Helvetica')
    doc.y = netY + 44

    // İşveren maliyeti + kümülatif bilgi
    doc.fontSize(8).fillColor('#6b7280')
      .text(`Isveren Maliyeti: SGK Isveren ${fmt(p.ssi_employer)} TL + Issizlik Isveren ${fmt(p.unemployment_employer)} TL = Toplam ${fmt(p.employer_total_cost)} TL`, 50)
      .text(`Yilbasi Kumulatif Brut: ${fmt(p.ytd_gross)} TL  |  Kumulatif Gelir Vergisi: ${fmt(p.ytd_tax)} TL`)
    doc.fillColor('#000')
    doc.moveDown(2)

    // İmza alanları
    const sigY = doc.y
    doc.fontSize(9).text('Isveren / Yetkili Imza', 60, sigY, { width: 200 })
    doc.text('Personel Imza', 320, sigY, { width: 200 })
    doc.moveTo(60, sigY + 45).lineTo(250, sigY + 45).stroke()
    doc.moveTo(320, sigY + 45).lineTo(510, sigY + 45).stroke()

    doc.fontSize(7).fillColor('#9ca3af')
      .text(`Bu bordro bilgilendirme amaclidir. Yatakhane Yonetim Sistemi  |  Olusturma: ${new Date().toLocaleString('tr-TR')}`,
        50, doc.page.height - 50, { align: 'center' })

    doc.end()
    logAudit(req.user.id, 'payslip_pdf', 'payroll', p.id, `${ym} ${p.full_name}`)
  } catch (e) {
    console.error('[payslip/pdf]', e)
    if (!res.headersSent) res.status(e.statusCode || 500).json({ error: e.message || 'PDF olusturulamadi' })
  }
})

// ── H4 V8: Birleşik devamsızlık ──
shiftsRouter.get('/combined-absences', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(getCombinedAbsences({
      startDate: req.query.start,
      endDate: req.query.end,
    }))
  } catch (e) { logger.error('[combined-absences]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Personnel status (now staff) ──
shiftsRouter.get('/personnel', ...allStaff, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  res.json(staffStatusService(date, req.query.dept_id || null))
})

// ── Leave requests ──
shiftsRouter.get('/leave/balance/:staffId', ...allStaff, (req, res) => {
  res.json(leaveBalanceService(req.params.staffId))
})

shiftsRouter.get('/leave', ...allStaff, (req, res) => {
  res.json(leaveListService(req.query))
})

shiftsRouter.post('/leave', ...allStaff, (req, res) => {
  try {
    const id = createLeaveService(req.body)
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.patch('/leave/:id', ...managerOrSupervisor, (req, res) => {
  try {
    approveLeaveService(req.params.id, req.user.id, req.body.status)
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── Overtime ──
shiftsRouter.get('/overtime/summary', ...allStaff, (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7)
  res.json(overtimeSummaryService(month))
})

shiftsRouter.get('/overtime', ...allStaff, (req, res) => {
  res.json(overtimeListService(req.query))
})

shiftsRouter.post('/overtime', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createOvertimeService(req.body, req.user.id)
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Faz 28 — puantaj hücresinden gün bazlı FM upsert (0 saat kaydı siler)
shiftsRouter.post('/overtime/day', ...managerOrSupervisor, (req, res) => {
  try {
    overtimeDayService(req.body, req.user.id)
    logAudit(req.user.id, 'overtime_day_set', 'shifts', req.body.staff_id, `${req.body.work_date} ${req.body.hours}s`)
    res.json({ ok: true })
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.put('/overtime/:id', ...managerOrSupervisor, (req, res) => {
  try {
    updateOvertimeService(req.params.id, req.body)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/overtime/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteOvertimeService(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Attendance ──
shiftsRouter.get('/attendance/events', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(attendanceEventsService(req.query))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.post('/attendance/events', ...allStaff, (req, res) => {
  try {
    const event = attendanceEventService(req.body)
    logAudit(req.user?.id || null, 'attendance_event_ingest', 'shifts', event.id, `${event.source}:${event.event_type}`)
    res.status(event.inserted ? 201 : 200).json(event)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.post('/attendance/reconcile', ...managerOrSupervisor, (req, res) => {
  try {
    const result = reconcileAttendanceService(req.body, req.user.id, 'manual')
    logAudit(req.user.id, 'attendance_reconcile', 'shifts', req.body.staff_id || null, `${result.from}:${result.to}:${result.processed}`)
    res.json(result)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.get('/attendance/exceptions', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(attendanceExceptionsService(req.query))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.patch('/attendance/exceptions/:id', ...managerOrSupervisor, (req, res) => {
  try {
    const row = updateAttendanceExceptionService(req.params.id, req.body, req.user.id)
    logAudit(req.user.id, 'attendance_exception_update', 'shifts', row.id, `${row.status}:${row.exception_type}`)
    res.json(row)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.get('/attendance', ...allStaff, (req, res) => {
  res.json(attendanceListService(req.query))
})

shiftsRouter.post('/attendance/checkin', ...allStaff, (req, res) => {
  try {
    const result = checkInService(req.body)
    res.status(201).json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.post('/attendance/checkout', ...allStaff, (req, res) => {
  try {
    const result = checkOutService(req.body.log_id, req.body, req.user?.id || null)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ── Puantaj (Timesheet) ──
shiftsRouter.get('/puantaj', ...allStaff, (req, res) => {
  try {
    const { month, dept_id } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatında gereklidir' })
    res.json(puantajService(month, dept_id || null, { includeMeta: req.query.meta === '1' }))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

// ── Puantaj CSV Export (must be before /:staffId routes) ──
shiftsRouter.get('/puantaj/export/csv', ...allStaff, (req, res) => {
  try {
    const { month, dept_id } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatında gereklidir' })
    const csv = puantajCsvService(month, dept_id || null)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="puantaj-${month}.csv"`)
    res.send(csv)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

// ── Puantaj day breakdown (after CSV route to avoid staffId='export') ──
// ── Puantaj kod kayıt sistemi (must be before /:staffId routes) ──
shiftsRouter.get('/puantaj/codes', ...allStaff, (req, res) => {
  try { res.json(puantajCodesService(req.query)) }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.post('/puantaj/codes', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createPuantajCodeService(req.body)
    logAudit(req.user.id, 'puantaj_code_create', 'shifts', id, req.body?.code)
    res.status(201).json({ id })
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.put('/puantaj/codes/:id', ...managerOrSupervisor, (req, res) => {
  try {
    const row = updatePuantajCodeService(+req.params.id, req.body)
    logAudit(req.user.id, 'puantaj_code_update', 'shifts', +req.params.id, req.body?.code || req.body?.label || '')
    res.json(row)
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.delete('/puantaj/codes/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deletePuantajCodeService(+req.params.id)
    logAudit(req.user.id, 'puantaj_code_delete', 'shifts', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

// Puantaj approval workflow (must be before /:staffId routes)
shiftsRouter.get('/puantaj/approval/overview', ...managerOrSupervisor, (req, res) => {
  try {
    const { month } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatinda gereklidir' })
    res.json(puantajApprovalOverviewService({ month }))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.get('/puantaj/approval', ...managerOrSupervisor, (req, res) => {
  try {
    const { month, dept_id } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatinda gereklidir' })
    res.json(puantajApprovalService({ month, deptId: dept_id || null }))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.post('/puantaj/approval/submit', ...managerOrSupervisor, (req, res) => {
  try {
    const row = submitPuantajPeriodService(req.body, req.user)
    logAudit(req.user.id, 'puantaj_submit', 'shifts', null, req.body?.period)
    res.json(row)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.patch('/puantaj/approval/day', ...managerOrSupervisor, (req, res) => {
  try {
    const row = updatePuantajDayApprovalService(req.body, req.user)
    logAudit(req.user.id, 'puantaj_day_approval', 'shifts', null, `${req.body?.work_date || ''}:${req.body?.status || ''}`)
    res.json(row)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message, details: e.details || null })
  }
})

shiftsRouter.patch('/puantaj/approval/period', ...managerOnly, (req, res) => {
  try {
    const row = updatePuantajPeriodApprovalService(req.body, req.user)
    logAudit(req.user.id, 'puantaj_period_approval', 'shifts', null, `${req.body?.period || ''}:${req.body?.action || ''}`)
    res.json(row)
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.get('/staff/:id/assignments', ...managerOrSupervisor, (req, res) => {
  try {
    res.json(staffAssignmentsService(req.params.id))
  } catch (e) {
    res.status(404).json({ error: e.message })
  }
})

shiftsRouter.post('/staff/:id/assignments', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createStaffAssignmentService(req.params.id, req.body, req.user.id)
    res.status(201).json({ id })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

shiftsRouter.post('/puantaj/day-detail', ...managerOrSupervisor, documentUpload.single('attachment'), verifyDocumentMagicBytes, (req, res) => {
  try {
    const fileData = req.file ? {
      attachment_url: `/uploads/${req.file.filename}`,
      attachment_name: req.file.originalname,
      attachment_mime: req.file.mimetype,
    } : {}
    const row = upsertPuantajDayDetail({ ...req.body, ...fileData }, req.user.id)
    logAudit(req.user.id, 'puantaj_day_detail', 'shifts', row.id, `${row.staff_id}:${row.work_date}`)
    res.json({ ok: true, row })
  } catch (e) {
    try {
      if (req.file) fs.unlinkSync(req.file.path)
    } catch {
      // best effort cleanup
    }
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

// Puantaj day breakdown (after approval routes to avoid staffId collisions)
shiftsRouter.get('/puantaj/days', ...allStaff, (req, res) => {
  try {
    const { month, dept_id } = req.query
    if (!month) return res.status(400).json({ error: 'month parametresi YYYY-MM formatÄ±nda gereklidir' })
    res.json(puantajDaysService(month, dept_id || null))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

shiftsRouter.get('/puantaj/:staffId/days', ...allStaff, (req, res) => {
  try {
    res.json(staffDayBreakdownService(req.params.staffId, req.query.month))
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message })
  }
})

// ── Statistics ──
shiftsRouter.get('/statistics', ...allStaff, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0]
  res.json(statisticsService(date))
})

// Kapsama panosu (X4): vardiya×gün gerçekleşen vs hedef (min_staff)
shiftsRouter.get('/coverage', ...allStaff, (req, res) => {
  try { res.json(coverageService({ from: req.query.from, to: req.query.to })) }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.get('/coverage-rules', ...allStaff, (req, res) => {
  try { res.json(coverageRulesService({ includeInactive: req.query.all === '1' })) }
  catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.post('/coverage-rules', ...managerOrSupervisor, (req, res) => {
  try {
    const row = createCoverageRuleService(req.body, req.user)
    logAudit(req.user.id, 'coverage_rule_create', 'shifts', row.id, row.name)
    res.status(201).json(row)
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.put('/coverage-rules/:id', ...managerOrSupervisor, (req, res) => {
  try {
    const row = updateCoverageRuleService(+req.params.id, req.body)
    logAudit(req.user.id, 'coverage_rule_update', 'shifts', row.id, row.name)
    res.json(row)
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.delete('/coverage-rules/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteCoverageRuleService(+req.params.id)
    logAudit(req.user.id, 'coverage_rule_delete', 'shifts', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

// ── Department CRUD ──
shiftsRouter.post('/departments', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createDepartmentService(req.body)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.put('/departments/:id', ...managerOrSupervisor, (req, res) => {
  try {
    updateDepartmentService(req.params.id, req.body)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/departments/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteDepartmentService(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.post('/departments/assign', ...managerOrSupervisor, (req, res) => {
  try {
    assignDeptService(req.body.staff_id, req.body.dept_id, req.user.id, req.body.effective_from)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Shift definition CRUD ──
shiftsRouter.post('/definitions', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createShiftDefService(req.body)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.put('/definitions/:id', ...managerOrSupervisor, (req, res) => {
  try {
    updateShiftDefService(req.params.id, req.body)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/definitions/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteShiftDefService(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Leave cancel ──
shiftsRouter.delete('/leave/:id', ...managerOrSupervisor, (req, res) => {
  try {
    cancelLeaveService(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Swap requests ──
shiftsRouter.get('/swaps', ...allStaff, (req, res) => {
  res.json(swapListService(req.query))
})

shiftsRouter.post('/swaps', ...allStaff, (req, res) => {
  try {
    const id = createSwapService(req.body)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.patch('/swaps/:id/accept', ...managerOrSupervisor, (req, res) => {
  try {
    const row = acceptSwapService(req.params.id, req.body.target_id)
    logAudit(req.user.id, 'shift_swap_target_accept', 'shifts', +req.params.id, `target:${row.target_id}`)
    res.json(row)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.patch('/swaps/:id/approve', ...managerOrSupervisor, (req, res) => {
  try {
    const row = approveSwapService(req.params.id, req.user.id)
    res.json({ ok: true, row })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.patch('/swaps/:id/reject', ...managerOrSupervisor, (req, res) => {
  try {
    rejectSwapService(req.params.id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Copy week ──
shiftsRouter.post('/schedule/copy-week', ...managerOrSupervisor, (req, res) => {
  try {
    const count = copyWeekService(req.body.source_week, req.body.target_week, req.user.id)
    res.json({ ok: true, copied: count })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Rotation template ──
shiftsRouter.post('/schedule/rotation', ...managerOrSupervisor, (req, res) => {
  try {
    const count = rotationService(req.body, req.user.id)
    res.json({ ok: true, assigned: count })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Faz 30: İsimli rotasyon şablonları ──
shiftsRouter.get('/rotation-templates', ...managerOrSupervisor, (req, res) => {
  try { res.json(rotationTemplatesService()) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.post('/rotation-templates', ...managerOrSupervisor, (req, res) => {
  try {
    const id = createRotationTemplateService(req.body, req.user.id)
    logAudit(req.user.id, 'rotation_template_create', 'shifts', id, req.body.name)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.delete('/rotation-templates/:id', ...managerOrSupervisor, (req, res) => {
  try {
    deleteRotationTemplateService(+req.params.id)
    logAudit(req.user.id, 'rotation_template_delete', 'shifts', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.post('/rotation-templates/preview', ...managerOrSupervisor, (req, res) => {
  try { res.json(rotationPreviewService(req.body)) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.post('/rotation-templates/apply', ...managerOrSupervisor, (req, res) => {
  try {
    const result = rotationApplyService(req.body, req.user.id)
    logAudit(req.user.id, 'rotation_apply', 'shifts', null, `${req.body.start_date} · ${result.count} giriş`)
    res.json(result)
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

// ── Faz 31: Dönem kilidi (ay kapatma) — kilitle/aç sadece müdür ──
shiftsRouter.get('/period-locks', ...managerOrSupervisor, (req, res) => {
  try { res.json(periodLocksService()) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

shiftsRouter.post('/period-locks', ...managerOnly, (req, res) => {
  try {
    lockPeriodService(req.body.period, req.user.id, req.body.note)
    logAudit(req.user.id, 'period_lock', 'shifts', null, req.body.period)
    res.status(201).json({ ok: true })
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

shiftsRouter.delete('/period-locks/:period', ...managerOnly, (req, res) => {
  try {
    unlockPeriodService(req.params.period)
    logAudit(req.user.id, 'period_unlock', 'shifts', null, req.params.period)
    res.json({ ok: true })
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})

// ── Delete schedule entry ──
shiftsRouter.delete('/schedule/:staffId/:date', ...managerOrSupervisor, (req, res) => {
  try {
    deleteScheduleService(req.params.staffId, req.params.date, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(e.statusCode || 400).json({ error: e.message }) }
})
