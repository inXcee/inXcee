import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { validate } from '../../shared/middleware/validate.js'
import {
  addNoteSchema, updateNoteSchema, createFollowupSchema, updateFollowupSchema,
  createRequirementSchema, updateRequirementSchema, emergencyContactSchema,
  emergencyContactUpdateSchema, archiveSchema, importPersonnelSchema,
  offboardingStartSchema, offboardingFinalizeSchema, restoreEmploymentSchema,
  trackingRulesUpdateSchema, trackingAlertUpdateSchema, trackingAlertFollowupSchema,
} from './schemas.js'
import {
  listFollowups, createFollowup, updateFollowup, completeFollowup, cancelFollowup,
} from './staff-followups.js'
import {
  listUniform, saveUniformSizes, issueUniform, returnUniformIssue,
  listUniformItems, createUniformItem, updateUniformItem, deleteUniformItem,
} from './staff-uniform.js'
import * as q from './queries.js'
import { importPersonnel, listPersonnelImportBatches, undoPersonnelImport } from './import.js'
import { logger } from '../../shared/logger.js'
import { applyDossierAccess, dossierAccess } from './access-policy.js'
import { getDossier, getDossierTimeline } from './dossier.js'
import { documentUpload, verifyDocumentBytes } from '../../shared/uploads/document-middleware.js'
import fs from 'fs'
import {
  listStaffDocuments, createStaffDocument, updateStaffDocument,
  archiveStaffDocument, getStaffDocumentForDownload,
  listDocumentRequirements, createDocumentRequirement, updateDocumentRequirement,
  deleteDocumentRequirement, listDocumentCatalog, getAttachmentForDownload,
} from './staff-documents.js'
import {
  getOffboardingImpact, startOffboarding, startArchiveCompatibility,
  finalizeOffboarding, restoreEmployment,
} from './offboarding-service.js'
import {
  evaluatePersonnelAlerts, listPersonnelAlerts, listTrackingRules,
  updateTrackingRules, updatePersonnelAlert, convertAlertToFollowup,
} from './tracking-alerts.js'
import {
  getTrackingOverview, listTrackingPeople, listTrackingEvents, getPersonTracking,
} from './tracking-read.js'

export const personnelRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const mgrOnly = requireRole('campus_manager')
const view = dossierAccess

function cleanupUpload(file) {
  if (file?.path) { try { fs.unlinkSync(file.path) } catch { /* zaten yok */ } }
}

function trackingError(res, error, context) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ error: error.message, details: error.details })
  }
  logger.error(context, error)
  return res.status(500).json({ error: 'Sunucu hatasi' })
}

// Personel Takip Merkezi backend sozlesmeleri.
personnelRouter.get('/tracking/overview', ...mgr, (req, res) => {
  try {
    evaluatePersonnelAlerts()
    res.json(getTrackingOverview(req.query))
  } catch (error) { trackingError(res, error, '[personnel/tracking-overview]') }
})

personnelRouter.get('/tracking/people', ...mgr, (req, res) => {
  try { res.json(listTrackingPeople(req.query)) }
  catch (error) { trackingError(res, error, '[personnel/tracking-people]') }
})

personnelRouter.get('/tracking/events', ...mgr, (req, res) => {
  try { res.json(listTrackingEvents(req.query)) }
  catch (error) { trackingError(res, error, '[personnel/tracking-events]') }
})

personnelRouter.get('/tracking/settings', ...mgr, (req, res) => {
  try { res.json({ rules: listTrackingRules() }) }
  catch (error) { trackingError(res, error, '[personnel/tracking-settings]') }
})

personnelRouter.patch('/tracking/settings', ...mgrOnly, validate(trackingRulesUpdateSchema), (req, res) => {
  try {
    const rules = updateTrackingRules(req.validated.rules, req.user.id)
    logAudit(req.user.id, 'personnel_tracking_settings_update', 'personnel', null, `${req.validated.rules.length} kural`)
    res.json({ rules })
  } catch (error) { trackingError(res, error, '[personnel/tracking-settings-update]') }
})

personnelRouter.get('/tracking/alerts', ...mgr, (req, res) => {
  try { res.json({ items: listPersonnelAlerts(req.query) }) }
  catch (error) { trackingError(res, error, '[personnel/tracking-alerts]') }
})

personnelRouter.patch('/tracking/alerts/:alertId', ...mgr, validate(trackingAlertUpdateSchema), (req, res) => {
  try {
    const alert = updatePersonnelAlert(+req.params.alertId, req.validated, req.user.id)
    logAudit(req.user.id, 'personnel_tracking_alert_update', 'personnel', +req.params.alertId, req.validated.status || 'assignment')
    res.json(alert)
  } catch (error) { trackingError(res, error, '[personnel/tracking-alert-update]') }
})

personnelRouter.post('/tracking/alerts/:alertId/followup', ...mgr, validate(trackingAlertFollowupSchema), (req, res) => {
  try {
    const followup = convertAlertToFollowup(+req.params.alertId, req.validated, req.user.id)
    logAudit(req.user.id, 'personnel_tracking_alert_followup', 'personnel', +req.params.alertId, `followup:${followup.id}`)
    res.status(followup.existing ? 200 : 201).json(followup)
  } catch (error) { trackingError(res, error, '[personnel/tracking-alert-followup]') }
})

// ── Excel toplu içe aktarım ──
personnelRouter.post('/import', ...mgr, validate(importPersonnelSchema), (req, res) => {
  try {
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true'
    const report = importPersonnel(req.validated, req.user.id, { dryRun })
    if (!dryRun) logAudit(req.user.id, 'personnel_import', 'personnel', report.batchId, `${report.created.length} sakin içe aktarıldı`)
    res.json(report)
  } catch (e) { logger.error('[personnel/import]', e); res.status(400).json({ error: e.message }) }
})

personnelRouter.get('/import/batches', ...mgr, (req, res) => {
  try { res.json(listPersonnelImportBatches()) }
  catch (e) { logger.error('[personnel/import/batches]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

personnelRouter.post('/import/batches/:id/undo', ...mgr, (req, res) => {
  try {
    const result = undoPersonnelImport(+req.params.id)
    logAudit(req.user.id, 'personnel_import_undo', 'personnel', +req.params.id, `${result.personnelDeleted} sakin geri alındı`)
    res.json(result)
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Unified personnel dossier
personnelRouter.get('/:id/dossier', ...view, (req, res) => {
  try {
    const data = getDossier(+req.params.id, {
      includeSensitive: req.user.role === 'campus_manager',
    })
    if (!data) return res.status(404).json({ error: 'Personel bulunamadı' })
    res.json(applyDossierAccess(data, req.user.role))
  } catch (e) { logger.error('[personnel/dossier]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

personnelRouter.get('/:id/dossier/timeline', ...view, (req, res) => {
  try {
    const kinds = typeof req.query.types === 'string'
      ? req.query.types.split(',').map(value => value.trim()).filter(Boolean)
      : []
    const data = getDossierTimeline(+req.params.id, {
      page: req.query.page,
      limit: req.query.limit,
      from: req.query.from,
      to: req.query.to,
      kinds,
      includeSensitive: req.user.role === 'campus_manager',
    })
    if (!data) return res.status(404).json({ error: 'Personel bulunamadı' })
    res.json(data)
  } catch (e) { logger.error('[personnel/dossier-timeline]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Zorunlu belge kuralları (tür yönetimi) — spesifik yollar önce ──
personnelRouter.get('/document-requirements', ...view, (req, res) => {
  try { res.json(listDocumentRequirements()) }
  catch (e) { logger.error('[personnel/doc-requirements]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

personnelRouter.post('/document-requirements', ...mgrOnly, validate(createRequirementSchema), (req, res) => {
  try {
    const result = createDocumentRequirement(req.validated, { userId: req.user.id })
    logAudit(req.user.id, 'staff_doc_requirement_create', 'personnel', result.id, req.validated.document_kind)
    res.status(201).json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/doc-requirement-create]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.patch('/document-requirements/:reqId', ...mgrOnly, validate(updateRequirementSchema), (req, res) => {
  try {
    const result = updateDocumentRequirement(+req.params.reqId, req.validated)
    logAudit(req.user.id, 'staff_doc_requirement_update', 'personnel', +req.params.reqId, '')
    res.json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/doc-requirement-update]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.delete('/document-requirements/:reqId', ...mgrOnly, (req, res) => {
  try {
    deleteDocumentRequirement(+req.params.reqId)
    logAudit(req.user.id, 'staff_doc_requirement_delete', 'personnel', +req.params.reqId, '')
    res.json({ ok: true })
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/doc-requirement-delete]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Kıyafet/ekipman tür kataloğu (yönetim) — spesifik yollar önce ──
personnelRouter.get('/uniform/items', ...view, (req, res) => {
  try { res.json(listUniformItems()) }
  catch (e) { logger.error('[personnel/uniform-items]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

personnelRouter.post('/uniform/items', ...mgrOnly, (req, res) => {
  try {
    const result = createUniformItem(req.body, { userId: req.user.id })
    logAudit(req.user.id, 'uniform_item_create', 'personnel', result.id, result.item_key)
    res.status(201).json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/uniform-item-create]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.patch('/uniform/items/:itemId', ...mgrOnly, (req, res) => {
  try {
    res.json(updateUniformItem(+req.params.itemId, req.body))
    logAudit(req.user.id, 'uniform_item_update', 'personnel', +req.params.itemId, '')
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/uniform-item-update]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.delete('/uniform/items/:itemId', ...mgrOnly, (req, res) => {
  try {
    const result = deleteUniformItem(+req.params.itemId)
    logAudit(req.user.id, 'uniform_item_delete', 'personnel', +req.params.itemId, '')
    res.json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/uniform-item-delete]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.post('/uniform/issues/:issueId/return', ...mgr, (req, res) => {
  try {
    returnUniformIssue(+req.params.issueId, { userId: req.user.id })
    logAudit(req.user.id, 'uniform_return', 'personnel', +req.params.issueId, '')
    res.json({ ok: true })
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/uniform-return]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Kişi kıyafet/beden + zimmet ──
personnelRouter.get('/:id/uniform', ...view, (req, res) => {
  try { res.json(listUniform(+req.params.id)) }
  catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/uniform]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.put('/:id/uniform/sizes', ...mgr, (req, res) => {
  try {
    const result = saveUniformSizes(+req.params.id, req.body?.sizes, { userId: req.user.id })
    logAudit(req.user.id, 'uniform_sizes_save', 'personnel', +req.params.id, `${result.saved} beden`)
    res.json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/uniform-sizes]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.post('/:id/uniform/issue', ...mgr, (req, res) => {
  try {
    const result = issueUniform(+req.params.id, req.body, { userId: req.user.id })
    logAudit(req.user.id, 'uniform_issue', 'personnel', +req.params.id, req.body?.item_key || '')
    res.status(201).json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/uniform-issue]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Çapraz-personel belge kataloğu (genel belgeler sayfası) ──
personnelRouter.get('/documents/catalog', ...view, (req, res) => {
  try {
    res.json(listDocumentCatalog({
      staffId: req.query.staff_id,
      documentKind: req.query.document_kind,
      status: req.query.status,
      q: req.query.q,
      includeArchived: req.query.archived === '1',
      role: req.user.role,
    }))
  } catch (e) { logger.error('[personnel/document-catalog]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── İzin/mesai/puantaj eki indirme (salt-okunur, operasyonel) ──
personnelRouter.get('/documents/attachment/:attachmentId/download', ...view, (req, res) => {
  try {
    const document = getAttachmentForDownload(+req.params.attachmentId)
    logAudit(req.user.id, 'staff_attachment_download', 'personnel', +req.params.attachmentId, '')
    res.setHeader('Content-Type', document.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.file_name || 'ek')}"`)
    fs.createReadStream(document.file_path).pipe(res)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/attachment-download]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Birleşik belge yönetimi (Faz 5) ──
personnelRouter.get('/:id/documents', ...view, (req, res) => {
  try {
    res.json(listStaffDocuments(+req.params.id, { role: req.user.role }))
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/documents]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.post('/:id/documents', ...view, documentUpload.single('file'), verifyDocumentBytes, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' })
    const result = createStaffDocument(+req.params.id, req.file, req.body, {
      role: req.user.role, userId: req.user.id,
    })
    logAudit(req.user.id, 'staff_document_upload', 'personnel', +req.params.id,
      `${req.body.document_kind || 'other'}: ${req.body.title || req.file.originalname}`)
    res.status(201).json(result)
  } catch (e) {
    cleanupUpload(req.file)
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/document-upload]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.patch('/documents/:documentId', ...view, (req, res) => {
  try {
    const result = updateStaffDocument(+req.params.documentId, req.body, { role: req.user.role })
    logAudit(req.user.id, 'staff_document_update', 'documents', +req.params.documentId, '')
    res.json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/document-update]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.post('/documents/:documentId/archive', ...view, (req, res) => {
  try {
    const result = archiveStaffDocument(+req.params.documentId, { role: req.user.role })
    logAudit(req.user.id, 'staff_document_archive', 'documents', +req.params.documentId, '')
    res.json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/document-archive]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.get('/documents/:documentId/download', ...view, (req, res) => {
  try {
    const document = getStaffDocumentForDownload(+req.params.documentId, { role: req.user.role })
    logAudit(req.user.id, 'staff_document_download', 'documents', +req.params.documentId, '')
    res.setHeader('Content-Type', document.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.file_name || 'belge')}"`)
    fs.createReadStream(document.file_path).pipe(res)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/document-download]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── 360° ──
personnelRouter.get('/:id/360', ...view, (req, res) => {
  try {
    const data = q.get360(+req.params.id)
    if (!data) return res.status(404).json({ error: 'Personel bulunamadı' })
    res.json(applyDossierAccess(data, req.user.role))
  } catch (e) { logger.error('[personnel/360]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

personnelRouter.get('/:id/timeline', ...view, (req, res) => {
  try { res.json(q.getTimeline(+req.params.id)) }
  catch (e) { logger.error('[personnel/timeline]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── Notlar ──
personnelRouter.get('/:id/notes', ...view, (req, res) => {
  try {
    res.json(q.listNotes(+req.params.id, {
      includeSensitive: req.user.role === 'campus_manager',
      includeArchived: req.query.archived === '1',
    }))
  } catch (e) { logger.error('[personnel/notes]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

personnelRouter.post('/:id/notes', ...mgr, validate(addNoteSchema), (req, res) => {
  try {
    const { note, pinned, category, visibility } = req.validated
    // Vardiya sorumlusu hassas not oluşturamaz.
    if (visibility === 'sensitive' && req.user.role !== 'campus_manager') {
      return res.status(403).json({ error: 'Hassas not için kampüs müdürü yetkisi gerekir' })
    }
    const id = q.addNote({
      staffId: +req.params.id,
      authorId: req.user.id,
      authorName: req.user.full_name || req.user.username,
      note, pinned, category, visibility,
    })
    logAudit(req.user.id, 'staff_note_add', 'personnel', +req.params.id, note.slice(0, 50))
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

// Hassas notu yalnız müdür okuyabilir/yönetebilir — mutasyon uçlarında da uygula.
function guardSensitiveNote(req, res, next) {
  const visibility = q.getNoteVisibility(+req.params.noteId)
  if (visibility === null) return res.status(404).json({ error: 'Not bulunamadı' })
  if (visibility === 'sensitive' && req.user.role !== 'campus_manager') {
    return res.status(403).json({ error: 'Bu nota erişim yetkiniz yok' })
  }
  next()
}

personnelRouter.patch('/notes/:noteId', ...mgr, guardSensitiveNote, validate(updateNoteSchema), (req, res) => {
  try {
    if (req.validated.visibility === 'sensitive' && req.user.role !== 'campus_manager') {
      return res.status(403).json({ error: 'Hassas not için kampüs müdürü yetkisi gerekir' })
    }
    q.updateNote(+req.params.noteId, req.validated)
    logAudit(req.user.id, 'staff_note_update', 'personnel', +req.params.noteId, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.post('/notes/:noteId/archive', ...mgr, guardSensitiveNote, (req, res) => {
  try {
    q.archiveNote(+req.params.noteId)
    logAudit(req.user.id, 'staff_note_archive', 'personnel', +req.params.noteId, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.delete('/notes/:noteId', ...mgr, guardSensitiveNote, (req, res) => {
  try { q.deleteNote(+req.params.noteId); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.patch('/notes/:noteId/pin', ...mgr, guardSensitiveNote, (req, res) => {
  try { q.togglePinNote(+req.params.noteId); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

// ── Görevler ve takip (Faz 7) ──
personnelRouter.get('/:id/followups', ...view, (req, res) => {
  try {
    res.json(listFollowups(+req.params.id, { status: req.query.status }))
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/followups]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.post('/:id/followups', ...mgr, validate(createFollowupSchema), (req, res) => {
  try {
    const result = createFollowup(+req.params.id, req.validated, { userId: req.user.id })
    logAudit(req.user.id, 'staff_followup_create', 'personnel', +req.params.id, req.validated.title.slice(0, 60))
    res.status(201).json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/followup-create]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.patch('/followups/:followupId', ...mgr, validate(updateFollowupSchema), (req, res) => {
  try {
    const result = updateFollowup(+req.params.followupId, req.validated, { userId: req.user.id })
    logAudit(req.user.id, 'staff_followup_update', 'personnel', +req.params.followupId, '')
    res.json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/followup-update]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.post('/followups/:followupId/complete', ...mgr, (req, res) => {
  try {
    completeFollowup(+req.params.followupId, { userId: req.user.id })
    logAudit(req.user.id, 'staff_followup_complete', 'personnel', +req.params.followupId, '')
    res.json({ ok: true })
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/followup-complete]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

personnelRouter.post('/followups/:followupId/cancel', ...mgr, (req, res) => {
  try {
    cancelFollowup(+req.params.followupId, { userId: req.user.id })
    logAudit(req.user.id, 'staff_followup_cancel', 'personnel', +req.params.followupId, '')
    res.json({ ok: true })
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    logger.error('[personnel/followup-cancel]', e); res.status(500).json({ error: 'Sunucu hatası' })
  }
})

// ── Acil iletişim ──
personnelRouter.post('/:id/emergency-contacts', ...mgr, validate(emergencyContactSchema), (req, res) => {
  try {
    const id = q.addEmergencyContact(+req.params.id, req.validated)
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.put('/emergency-contacts/:id', ...mgr, validate(emergencyContactUpdateSchema), (req, res) => {
  try { q.updateEmergencyContact(+req.params.id, req.validated); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.delete('/emergency-contacts/:id', ...mgr, (req, res) => {
  try { q.deleteEmergencyContact(+req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.get('/:id/tracking', ...mgr, (req, res) => {
  try { res.json(getPersonTracking(+req.params.id, req.query)) }
  catch (error) { trackingError(res, error, '[personnel/person-tracking]') }
})

personnelRouter.get('/:id/offboarding-impact', ...mgr, (req, res) => {
  try { res.json(getOffboardingImpact(+req.params.id, req.query.exit_date)) }
  catch (error) { trackingError(res, error, '[personnel/offboarding-impact]') }
})

personnelRouter.post('/:id/offboarding/start', ...mgr, validate(offboardingStartSchema), (req, res) => {
  try {
    const result = startOffboarding(+req.params.id, req.validated, req.user.id)
    logAudit(req.user.id, 'staff_offboarding_start', 'personnel', +req.params.id, req.validated.reason)
    res.status(201).json(result)
  } catch (error) { trackingError(res, error, '[personnel/offboarding-start]') }
})

personnelRouter.post('/:id/offboarding/finalize', ...mgr, validate(offboardingFinalizeSchema), (req, res) => {
  try {
    const result = finalizeOffboarding(+req.params.id, req.validated, req.user.id)
    logAudit(req.user.id, 'staff_offboarding_finalize', 'personnel', +req.params.id, '')
    res.json(result)
  } catch (error) { trackingError(res, error, '[personnel/offboarding-finalize]') }
})

// ── Arşiv ──
personnelRouter.post('/:id/archive', ...mgr, validate(archiveSchema), (req, res) => {
  try {
    const reason = req.validated.reason
    const result = startArchiveCompatibility(+req.params.id, reason, req.user.id)
    logAudit(req.user.id, 'staff_archive', 'personnel', +req.params.id, reason || '')
    res.status(202).json({ ok: true, offboarding_started: true, ...result })
  } catch (error) { trackingError(res, error, '[personnel/archive]') }
})

personnelRouter.post('/:id/restore', ...mgr, validate(restoreEmploymentSchema), (req, res) => {
  try {
    const result = restoreEmployment(+req.params.id, req.validated, req.user.id)
    logAudit(req.user.id, 'staff_restore', 'personnel', +req.params.id, req.validated.reason || '')
    res.json(result)
  } catch (error) { trackingError(res, error, '[personnel/restore]') }
})

personnelRouter.get('/archived', ...view, (req, res) => {
  try { res.json(q.listArchived({ q: req.query.q })) }
  catch (e) { logger.error('[personnel/archived]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

// ── R5 Risk listesi ──
personnelRouter.get('/risk', ...view, (req, res) => {
  try { res.json(q.getRiskList({ limit: req.query.limit ? +req.query.limit : 30 })) }
  catch (e) { logger.error('[personnel/risk]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})
