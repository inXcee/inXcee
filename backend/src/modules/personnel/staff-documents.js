import fs from 'fs'
import path from 'path'
import { getDB } from '../../shared/db/index.js'
import { canAccessDossierDocument } from './access-policy.js'

// Birleşik personel belge kataloğu: staff_id'ye bağlı yeni belgeler (kanonik) +
// izin/mesai/puantaj ekleri (leave_documents üzerinden salt-okunur gösterim).
export const DOCUMENT_KINDS = [
  'identity', 'contract', 'social_security', 'health_report', 'certificate',
  'training', 'kvkk', 'bank', 'payroll', 'discipline', 'work_accident', 'other',
]
const KIND_SET = new Set(DOCUMENT_KINDS)
const SENSITIVE_KINDS = new Set([
  'identity', 'contract', 'social_security', 'health_report', 'kvkk', 'bank', 'payroll',
])

const KIND_LABELS = {
  identity: 'Kimlik', contract: 'Sözleşme', social_security: 'SGK',
  health_report: 'Sağlık raporu', certificate: 'Sertifika', training: 'Eğitim',
  kvkk: 'KVKK', bank: 'Banka', payroll: 'Bordro', discipline: 'Disiplin',
  work_accident: 'İş kazası', other: 'Diğer',
}

const LEAVE_TYPE_LABELS = {
  annual: 'Yıllık izin', sick: 'Hastalık izni', emergency: 'Acil izin',
  maternity: 'Doğum izni', paternity: 'Babalık izni', marriage: 'Evlilik izni',
  bereavement: 'Vefat izni', unpaid: 'Ücretsiz izin',
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

function isValidDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

// visibility, kaynak türü + kullanıcı seçiminden türetilir: hassas türler her zaman
// 'sensitive'; kullanıcı operasyonel bir türü açıkça hassas işaretleyebilir.
export function resolveVisibility(documentKind, requested) {
  if (SENSITIVE_KINDS.has(documentKind)) return 'sensitive'
  return requested === 'sensitive' ? 'sensitive' : 'operational'
}

function documentStatus(document, today) {
  if (document.archived_at) return 'archived'
  if (document.expires_on && document.expires_on < today) return 'expired'
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  if (document.expires_on && document.expires_on <= soon) return 'expiring'
  return 'active'
}

function requireStaff(db, staffId) {
  const staff = db.prepare('SELECT id, full_name FROM staff WHERE id=?').get(staffId)
  if (!staff) {
    const err = new Error('Personel bulunamadı')
    err.statusCode = 404
    throw err
  }
  return staff
}

// Rol bazlı erişim: hassas belge içeriği vardiya sorumlusuna gösterilmez,
// yalnız operasyonel metadata (tür/durum/süre) döner. maskContent=true olan
// satırlarda download engellenir (route tarafında da doğrulanır).
function shapeDocument(document, role, today) {
  const canAccess = canAccessDossierDocument(role, document)
  const base = {
    id: document.id,
    source: 'staff',
    document_kind: document.document_kind,
    kind_label: KIND_LABELS[document.document_kind] || document.document_kind,
    title: document.title,
    document_no: document.document_no,
    issued_on: document.issued_on,
    expires_on: document.expires_on,
    visibility: document.visibility,
    version_group: document.version_group,
    uploaded_at: document.uploaded_at,
    uploaded_by_name: document.uploaded_by_name,
    archived_at: document.archived_at,
    mime_type: document.mime_type,
    size_bytes: document.size_bytes,
    status: documentStatus(document, today),
    can_access: canAccess,
  }
  if (!canAccess) {
    // Operasyonel metadata görünür; dosya adı/içerik erişimi kapalı.
    return { ...base, file_name: null, restricted: true }
  }
  return { ...base, file_name: document.file_name, restricted: false }
}

export function listStaffDocuments(staffId, { role } = {}) {
  const db = getDB()
  requireStaff(db, staffId)
  const today = isoToday()

  const rows = db.prepare(`
    SELECT d.id, d.document_kind, d.title, d.document_no, d.issued_on, d.expires_on,
      d.visibility, d.version_group, d.uploaded_at, d.archived_at, d.mime_type,
      d.size_bytes, d.file_name, u.full_name AS uploaded_by_name
    FROM documents d
    LEFT JOIN users u ON u.id=d.uploaded_by
    WHERE d.staff_id=?
    ORDER BY d.archived_at IS NOT NULL, d.uploaded_at DESC, d.id DESC
  `).all(staffId)

  // Sürüm gruplama: aynı version_group tek "güncel" belge + sürüm geçmişi olarak
  // döner. Satırlar arşiv-sonra + uploaded_at DESC sıralı → grubun ilk satırı güncel.
  const groups = new Map()
  for (const row of rows) {
    const key = row.version_group || `single-${row.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const documents = [...groups.values()].map(groupRows => {
    const current = shapeDocument(groupRows[0], role, today)
    const versions = groupRows.map(row => ({
      id: row.id,
      uploaded_at: row.uploaded_at,
      uploaded_by_name: row.uploaded_by_name,
      archived_at: row.archived_at,
      file_name: current.restricted ? null : row.file_name,
      size_bytes: row.size_bytes,
      can_access: current.can_access,
    }))
    return { ...current, version_count: versions.length, versions }
  })

  // Zorunlu belge kuralları: türe göre eksik/mevcut.
  const person = db.prepare('SELECT department_id, role_id FROM staff WHERE id=?').get(staffId)
  const requirements = db.prepare(`
    SELECT id, document_kind, display_name, requires_expiry, visibility
    FROM staff_document_requirements
    WHERE is_active=1
      AND (department_id IS NULL OR department_id=?)
      AND (role_id IS NULL OR role_id=?)
    ORDER BY display_name
  `).all(person?.department_id || null, person?.role_id || null)
  const activeKinds = new Set(rows.filter(row => !row.archived_at).map(row => row.document_kind))
  const requirementRows = requirements.map(requirement => ({
    ...requirement,
    satisfied: activeKinds.has(requirement.document_kind),
  }))

  // İzin / mesai / puantaj ekleri — salt-okunur, izin türü + tarih ile net etiketli.
  const attachments = db.prepare(`
    SELECT ld.id, ld.file_name, ld.mime_type, ld.file_size, ld.document_kind, ld.created_at,
      CASE
        WHEN ld.leave_request_id IS NOT NULL THEN 'leave'
        WHEN ld.overtime_request_id IS NOT NULL THEN 'overtime'
        ELSE 'puantaj'
      END AS source,
      lr.leave_type, lr.start_date AS leave_start, lr.end_date AS leave_end,
      orq.work_date AS overtime_date, ss.work_date AS schedule_date
    FROM leave_documents ld
    LEFT JOIN leave_requests lr ON lr.id=ld.leave_request_id
    LEFT JOIN overtime_requests orq ON orq.id=ld.overtime_request_id
    LEFT JOIN shift_schedule ss ON ss.id=ld.schedule_id
    WHERE lr.staff_id=? OR orq.staff_id=? OR ss.staff_id=?
    ORDER BY ld.created_at DESC, ld.id DESC
  `).all(staffId, staffId, staffId).map(row => {
    const leaveLabel = row.source === 'leave'
      ? `${LEAVE_TYPE_LABELS[row.leave_type] || 'İzin'} eki`
      : row.source === 'overtime' ? 'Mesai eki' : 'Puantaj eki'
    const period = row.source === 'leave'
      ? (row.leave_start ? `${row.leave_start}${row.leave_end && row.leave_end !== row.leave_start ? ` → ${row.leave_end}` : ''}` : null)
      : (row.overtime_date || row.schedule_date || null)
    return {
      id: `attachment-${row.id}`,
      attachment_id: row.id,
      source: row.source,
      leave_type: row.leave_type || null,
      document_kind: row.document_kind || 'other',
      kind_label: leaveLabel,
      period,
      title: row.file_name,
      file_name: row.file_name,
      mime_type: row.mime_type,
      size_bytes: row.file_size,
      uploaded_at: row.created_at,
      visibility: 'operational',
      status: 'active',
      read_only: true,
      can_access: true,
    }
  })

  const visible = documents.filter(document => !document.archived_at)
  return {
    documents,
    attachments,
    requirements: requirementRows,
    summary: {
      total: documents.length,
      active: visible.length,
      archived: documents.length - visible.length,
      required: requirementRows.length,
      missing: requirementRows.filter(requirement => !requirement.satisfied).length,
      expired: visible.filter(document => document.status === 'expired').length,
      expiring: visible.filter(document => document.status === 'expiring').length,
      attachments: attachments.length,
    },
    kinds: DOCUMENT_KINDS.map(kind => ({ value: kind, label: KIND_LABELS[kind] })),
  }
}

function assertMetadata({ documentKind, issuedOn, expiresOn }) {
  if (!KIND_SET.has(documentKind)) {
    const err = new Error('Geçersiz belge türü')
    err.statusCode = 400
    throw err
  }
  if (issuedOn && !isValidDate(issuedOn)) {
    const err = new Error('Düzenlenme tarihi YYYY-MM-DD olmalı')
    err.statusCode = 400
    throw err
  }
  if (expiresOn && !isValidDate(expiresOn)) {
    const err = new Error('Bitiş tarihi YYYY-MM-DD olmalı')
    err.statusCode = 400
    throw err
  }
}

export function createStaffDocument(staffId, file, meta, { role, userId } = {}) {
  const db = getDB()
  requireStaff(db, staffId)
  const documentKind = String(meta.document_kind || 'other')
  const title = String(meta.title || '').trim() || (file?.originalname ?? 'Belge')
  const issuedOn = meta.issued_on ? String(meta.issued_on).slice(0, 10) : null
  const expiresOn = meta.expires_on ? String(meta.expires_on).slice(0, 10) : null
  assertMetadata({ documentKind, issuedOn, expiresOn })

  const visibility = resolveVisibility(documentKind, meta.visibility)
  // Vardiya sorumlusu hassas belge yükleyemez.
  if (visibility === 'sensitive' && role !== 'campus_manager') {
    const err = new Error('Hassas belge yüklemek için kampüs müdürü yetkisi gerekir')
    err.statusCode = 403
    throw err
  }

  // Sürüm grubu: yeni sürüm mevcut belgenin version_group'unu taşır; yoksa yeni grup.
  let versionGroup = meta.version_group ? String(meta.version_group).slice(0, 80) : null
  if (versionGroup) {
    const existing = db.prepare(
      'SELECT COUNT(*) AS count FROM documents WHERE staff_id=? AND version_group=?'
    ).get(staffId, versionGroup).count
    if (!existing) versionGroup = null
  }
  if (!versionGroup) versionGroup = `staff-${staffId}-${Date.now()}`

  const result = db.prepare(`
    INSERT INTO documents (category, title, file_name, file_path, mime_type, size_bytes,
      related_type, related_id, uploaded_by, staff_id, document_kind, document_no,
      issued_on, expires_on, visibility, version_group)
    VALUES ('id_doc', ?, ?, ?, ?, ?, 'none', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, file?.originalname || file?.filename, file?.path,
    file?.mimetype, file?.size, userId ?? null, staffId, documentKind,
    meta.document_no ? String(meta.document_no).slice(0, 120) : null,
    issuedOn, expiresOn, visibility, versionGroup,
  )
  return { id: result.lastInsertRowid, version_group: versionGroup, visibility }
}

function getOwnedDocument(db, documentId) {
  const document = db.prepare(`
    SELECT id, staff_id, document_kind, visibility, file_path, file_name, mime_type, archived_at
    FROM documents WHERE id=? AND staff_id IS NOT NULL
  `).get(documentId)
  if (!document) {
    const err = new Error('Belge bulunamadı')
    err.statusCode = 404
    throw err
  }
  return document
}

export function updateStaffDocument(documentId, meta, { role } = {}) {
  const db = getDB()
  const document = getOwnedDocument(db, documentId)
  const nextKind = meta.document_kind != null ? String(meta.document_kind) : document.document_kind
  const issuedOn = meta.issued_on != null ? (meta.issued_on ? String(meta.issued_on).slice(0, 10) : null) : undefined
  const expiresOn = meta.expires_on != null ? (meta.expires_on ? String(meta.expires_on).slice(0, 10) : null) : undefined
  assertMetadata({
    documentKind: nextKind,
    issuedOn: issuedOn === undefined ? null : issuedOn,
    expiresOn: expiresOn === undefined ? null : expiresOn,
  })

  const nextVisibility = resolveVisibility(
    nextKind,
    meta.visibility != null ? meta.visibility : document.visibility,
  )
  // Hassas belgeleri yalnız müdür yönetebilir (mevcut veya yeni durum hassassa).
  const touchesSensitive = nextVisibility === 'sensitive' || document.visibility === 'sensitive'
  if (touchesSensitive && role !== 'campus_manager') {
    const err = new Error('Hassas belgeyi düzenlemek için kampüs müdürü yetkisi gerekir')
    err.statusCode = 403
    throw err
  }

  const fields = []
  const params = []
  const set = (column, value) => { fields.push(`${column}=?`); params.push(value) }
  if (meta.title != null) set('title', String(meta.title).trim().slice(0, 300))
  if (meta.document_kind != null) set('document_kind', nextKind)
  if (meta.document_no != null) set('document_no', meta.document_no ? String(meta.document_no).slice(0, 120) : null)
  if (issuedOn !== undefined) set('issued_on', issuedOn)
  if (expiresOn !== undefined) set('expires_on', expiresOn)
  set('visibility', nextVisibility)
  if (!fields.length) return { ok: true, unchanged: true }
  params.push(documentId)
  db.prepare(`UPDATE documents SET ${fields.join(', ')} WHERE id=?`).run(...params)
  return { ok: true, visibility: nextVisibility }
}

export function archiveStaffDocument(documentId, { role } = {}) {
  const db = getDB()
  const document = getOwnedDocument(db, documentId)
  if (document.visibility === 'sensitive' && role !== 'campus_manager') {
    const err = new Error('Hassas belgeyi arşivlemek için kampüs müdürü yetkisi gerekir')
    err.statusCode = 403
    throw err
  }
  if (document.archived_at) return { ok: true, already: true }
  db.prepare("UPDATE documents SET archived_at=CURRENT_TIMESTAMP WHERE id=?").run(documentId)
  return { ok: true, staff_id: document.staff_id }
}

// İndirme: erişim yetkisi (rol + görünürlük) route'tan önce burada da doğrulanır.
export function getStaffDocumentForDownload(documentId, { role } = {}) {
  const db = getDB()
  const document = getOwnedDocument(db, documentId)
  if (!canAccessDossierDocument(role, document)) {
    const err = new Error('Bu belgeye erişim yetkiniz yok')
    err.statusCode = 403
    throw err
  }
  if (!document.file_path || !fs.existsSync(document.file_path)) {
    const err = new Error('Dosya bulunamadı')
    err.statusCode = 410
    throw err
  }
  return document
}

// İzin/mesai/puantaj eki indirme — leave_documents.file_url disk yoluna çözülür.
// Gerçek yükleme /uploads/<filename> (düz) — shifts indirme deseniyle aynı:
// UPLOADS_DIR + basename. Yol geçişi (path traversal) basename ile engellenir.
export function getAttachmentForDownload(attachmentId) {
  const db = getDB()
  const row = db.prepare(`
    SELECT id, file_name, mime_type, file_url FROM leave_documents WHERE id=?
  `).get(attachmentId)
  if (!row) throw fail('Ek bulunamadı', 404)
  if (!row.file_url) throw fail('Dosya bulunamadı', 410)
  const base = process.env.UPLOADS_DIR || 'uploads'
  const filePath = path.join(base, path.basename(String(row.file_url)))
  if (!fs.existsSync(filePath)) throw fail('Dosya bulunamadı', 410)
  return { ...row, file_path: filePath }
}

function fail(message, statusCode = 400) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

/* ─── Zorunlu belge kuralları (staff_document_requirements) ─────────────── */
export function listDocumentRequirements() {
  const db = getDB()
  const rows = db.prepare(`
    SELECT r.id, r.document_kind, r.display_name, r.department_id, r.role_id,
      r.requires_expiry, r.visibility, r.is_active, r.created_at,
      d.name AS department_name, sr.name AS role_name
    FROM staff_document_requirements r
    LEFT JOIN departments d ON d.id=r.department_id
    LEFT JOIN staff_roles sr ON sr.id=r.role_id
    ORDER BY r.is_active DESC, r.display_name
  `).all()
  return {
    requirements: rows.map(row => ({ ...row, kind_label: KIND_LABELS[row.document_kind] || row.document_kind })),
    kinds: DOCUMENT_KINDS.map(kind => ({ value: kind, label: KIND_LABELS[kind] })),
  }
}

function assertRequirementScope(db, { departmentId, roleId }) {
  if (departmentId != null && !db.prepare('SELECT id FROM departments WHERE id=?').get(departmentId)) {
    throw fail('Departman bulunamadı')
  }
  if (roleId != null && !db.prepare('SELECT id FROM staff_roles WHERE id=?').get(roleId)) {
    throw fail('Personel rolü bulunamadı')
  }
}

export function createDocumentRequirement(data, { userId } = {}) {
  const db = getDB()
  const documentKind = String(data.document_kind || '')
  if (!KIND_SET.has(documentKind)) throw fail('Geçersiz belge türü')
  const displayName = String(data.display_name || '').trim()
  if (!displayName) throw fail('Görünen ad gerekli')
  const departmentId = data.department_id ? +data.department_id : null
  const roleId = data.role_id ? +data.role_id : null
  assertRequirementScope(db, { departmentId, roleId })
  const visibility = data.visibility === 'sensitive' ? 'sensitive' : 'operational'
  try {
    const result = db.prepare(`
      INSERT INTO staff_document_requirements(
        document_kind, display_name, department_id, role_id, requires_expiry,
        visibility, is_active, created_by
      ) VALUES(?,?,?,?,?,?,1,?)
    `).run(documentKind, displayName, departmentId, roleId,
      data.requires_expiry ? 1 : 0, visibility, userId ?? null)
    return { id: result.lastInsertRowid }
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw fail('Bu tür/departman/rol için kural zaten var')
    throw e
  }
}

export function updateDocumentRequirement(id, data) {
  const db = getDB()
  const existing = db.prepare('SELECT id FROM staff_document_requirements WHERE id=?').get(id)
  if (!existing) throw fail('Kural bulunamadı', 404)
  const fields = []
  const params = []
  const set = (column, value) => { fields.push(`${column}=?`); params.push(value) }
  if (data.display_name != null) {
    const name = String(data.display_name).trim()
    if (!name) throw fail('Görünen ad boş olamaz')
    set('display_name', name.slice(0, 120))
  }
  if (data.requires_expiry != null) set('requires_expiry', data.requires_expiry ? 1 : 0)
  if (data.visibility != null) set('visibility', data.visibility === 'sensitive' ? 'sensitive' : 'operational')
  if (data.is_active != null) set('is_active', data.is_active ? 1 : 0)
  if (!fields.length) return { ok: true, unchanged: true }
  params.push(id)
  db.prepare(`UPDATE staff_document_requirements SET ${fields.join(', ')} WHERE id=?`).run(...params)
  return { ok: true }
}

export function deleteDocumentRequirement(id) {
  const db = getDB()
  const result = db.prepare('DELETE FROM staff_document_requirements WHERE id=?').run(id)
  if (!result.changes) throw fail('Kural bulunamadı', 404)
  return { ok: true }
}

/* ─── Çapraz-personel belge kataloğu (genel belgeler sayfası) ───────────── */
export function listDocumentCatalog({ staffId, documentKind, status, q, includeArchived, role } = {}) {
  const db = getDB()
  const today = isoToday()
  const where = ['d.staff_id IS NOT NULL']
  const params = []
  if (staffId) { where.push('d.staff_id=?'); params.push(+staffId) }
  if (documentKind && KIND_SET.has(documentKind)) { where.push('d.document_kind=?'); params.push(documentKind) }
  if (!includeArchived) where.push('d.archived_at IS NULL')
  if (q) { where.push('(d.title LIKE ? OR d.document_no LIKE ? OR s.full_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  const rows = db.prepare(`
    SELECT d.id, d.staff_id, d.document_kind, d.title, d.document_no, d.issued_on,
      d.expires_on, d.visibility, d.version_group, d.uploaded_at, d.archived_at,
      d.mime_type, d.size_bytes, d.file_name, s.full_name AS staff_name,
      dep.name AS department_name
    FROM documents d
    JOIN staff s ON s.id=d.staff_id
    LEFT JOIN departments dep ON dep.id=s.department_id
    WHERE ${where.join(' AND ')}
    ORDER BY d.uploaded_at DESC, d.id DESC
    LIMIT 500
  `).all(...params)
  let shaped = rows.map(row => ({
    ...shapeDocument(row, role, today),
    staff_id: row.staff_id,
    staff_name: row.staff_name,
    department_name: row.department_name,
  }))
  if (status) shaped = shaped.filter(document => document.status === status)
  return {
    documents: shaped,
    total: shaped.length,
    kinds: DOCUMENT_KINDS.map(kind => ({ value: kind, label: KIND_LABELS[kind] })),
    statuses: [
      { value: 'active', label: 'Geçerli' },
      { value: 'expiring', label: 'Süresi yaklaşan' },
      { value: 'expired', label: 'Süresi dolmuş' },
      { value: 'archived', label: 'Arşiv' },
    ],
  }
}
