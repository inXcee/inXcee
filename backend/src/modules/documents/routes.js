import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { requireRole, requireAuth } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { documentUpload, verifyDocumentBytes } from '../../shared/uploads/document-middleware.js'
import { logAudit } from '../../shared/audit.js'

export const documentsRouter = Router()
const mgmt = requireRole('campus_manager', 'shift_supervisor')

const VALID_CATEGORIES = ['contract', 'invoice', 'insurance', 'id_doc', 'report', 'other']
const VALID_RELATED = ['company', 'personnel', 'room', 'none']

documentsRouter.get('/', requireAuth, (req, res) => {
  const db = getDB()
  const where = []
  const params = []
  if (req.query.category) { where.push('d.category=?'); params.push(req.query.category) }
  if (req.query.related_type) { where.push('d.related_type=?'); params.push(req.query.related_type) }
  if (req.query.related_id) { where.push('d.related_id=?'); params.push(+req.query.related_id) }
  if (req.query.q) {
    where.push('(d.title LIKE ? OR d.description LIKE ?)')
    params.push(`%${req.query.q}%`, `%${req.query.q}%`)
  }
  const sql = `
    SELECT d.id, d.category, d.title, d.file_name, d.mime_type, d.size_bytes,
      d.related_type, d.related_id, d.description, d.uploaded_at,
      u.full_name AS uploaded_by_name
    FROM documents d
    LEFT JOIN users u ON u.id=d.uploaded_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY d.uploaded_at DESC LIMIT 500
  `
  res.json(db.prepare(sql).all(...params))
})

documentsRouter.post('/', ...mgmt, documentUpload.single('file'), verifyDocumentBytes, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' })
    const { category, title, related_type, related_id, description } = req.body
    if (!VALID_CATEGORIES.includes(category)) {
      try { fs.unlinkSync(req.file.path) } catch {}
      return res.status(400).json({ error: 'Geçersiz kategori' })
    }
    if (!title || title.trim().length < 2) {
      try { fs.unlinkSync(req.file.path) } catch {}
      return res.status(400).json({ error: 'Başlık gerekli' })
    }
    const relType = VALID_RELATED.includes(related_type) ? related_type : 'none'
    const db = getDB()
    const r = db.prepare(`
      INSERT INTO documents (category, title, file_name, file_path, mime_type, size_bytes,
        related_type, related_id, description, uploaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      category, title.trim(),
      req.file.originalname || req.file.filename,
      req.file.path,
      req.file.mimetype, req.file.size,
      relType, related_id ? +related_id : null,
      description || null, req.user.id
    )
    logAudit(req.user.id, 'document_upload', 'documents', r.lastInsertRowid, `${category}: ${title}`)
    res.status(201).json({ id: r.lastInsertRowid })
  } catch (e) {
    try { if (req.file) fs.unlinkSync(req.file.path) } catch {}
    res.status(500).json({ error: e.message })
  }
})

documentsRouter.get('/:id/download', requireAuth, (req, res) => {
  const db = getDB()
  const doc = db.prepare('SELECT file_path, file_name, mime_type FROM documents WHERE id=?').get(+req.params.id)
  if (!doc) return res.status(404).json({ error: 'Bulunamadı' })
  if (!fs.existsSync(doc.file_path)) return res.status(410).json({ error: 'Dosya silinmiş' })
  res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`)
  fs.createReadStream(doc.file_path).pipe(res)
})

documentsRouter.delete('/:id', ...mgmt, (req, res) => {
  const db = getDB()
  const doc = db.prepare('SELECT file_path, title FROM documents WHERE id=?').get(+req.params.id)
  if (!doc) return res.status(404).json({ error: 'Bulunamadı' })
  db.prepare('DELETE FROM documents WHERE id=?').run(+req.params.id)
  try { fs.unlinkSync(doc.file_path) } catch {}
  logAudit(req.user.id, 'document_delete', 'documents', +req.params.id, doc.title)
  res.json({ ok: true })
})
