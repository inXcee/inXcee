import { Router } from 'express'
import { requireRole } from '../../shared/auth/middleware.js'
import { logAudit } from '../../shared/audit.js'
import { validate } from '../../shared/middleware/validate.js'
import { addNoteSchema, emergencyContactSchema, emergencyContactUpdateSchema, archiveSchema, importPersonnelSchema } from './schemas.js'
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
} from './staff-documents.js'

export const personnelRouter = Router()
const mgr = requireRole('campus_manager', 'shift_supervisor')
const view = dossierAccess

function cleanupUpload(file) {
  if (file?.path) { try { fs.unlinkSync(file.path) } catch { /* zaten yok */ } }
}

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
personnelRouter.post('/:id/notes', ...mgr, validate(addNoteSchema), (req, res) => {
  try {
    const { note, pinned } = req.validated
    const id = q.addNote({
      staffId: +req.params.id,
      authorId: req.user.id,
      authorName: req.user.full_name || req.user.username,
      note,
      pinned,
    })
    logAudit(req.user.id, 'staff_note_add', 'personnel', +req.params.id, note.slice(0, 50))
    res.status(201).json({ id })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.delete('/notes/:noteId', ...mgr, (req, res) => {
  try { q.deleteNote(+req.params.noteId); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.patch('/notes/:noteId/pin', ...mgr, (req, res) => {
  try { q.togglePinNote(+req.params.noteId); res.json({ ok: true }) }
  catch (e) { res.status(400).json({ error: e.message }) }
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

// ── Arşiv ──
personnelRouter.post('/:id/archive', ...mgr, validate(archiveSchema), (req, res) => {
  try {
    const reason = req.validated.reason
    q.archiveStaff(+req.params.id, reason)
    logAudit(req.user.id, 'staff_archive', 'personnel', +req.params.id, reason || '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
})

personnelRouter.post('/:id/restore', ...mgr, (req, res) => {
  try {
    q.restoreStaff(+req.params.id)
    logAudit(req.user.id, 'staff_restore', 'personnel', +req.params.id, '')
    res.json({ ok: true })
  } catch (e) { res.status(400).json({ error: e.message }) }
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
