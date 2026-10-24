import { Router } from 'express'
import { requireAvsKiosk } from '../../shared/auth/middleware.js'
import { avsRoleGroup } from '../../shared/auth/avsRoles.js'
import { getDB } from '../../shared/db/index.js'
import { validate } from '../../shared/middleware/validate.js'
import { createImageUpload, verifyImageMagicBytes } from '../../shared/uploads/middleware.js'
import {
  boardBlocks, boardRooms, cleanFloor, markField, setOccupancy, undoField, undoFloor,
} from '../housekeeping/field.js'
import { verifyFieldLabel } from '../location-portal/field-scan.js'
import {
  fieldFloorSchema, fieldFloorUndoSchema, fieldLabelVerifySchema, fieldLocationSchema, fieldMarkSchema, fieldOccupancySchema,
} from './schemas.js'
import { removeUploadedFiles, uploadedFiles, validateUploadBody } from './upload-helpers.js'

// Saha ekranı oda panosu: kat hizmetleri ve çamaşırhane personeli telefondan/tabletten oda başına
// temizlendi / temizlenemedi / dolu-boş girer (docs/saha-ekrani.md). İş kuralları housekeeping/field.js'te;
// servis hatası statusCode'uyla döner, beklenmeyen hata genel işleyicide "Sunucu hatası" olur.
export const avsBoardRouter = Router()
const FIELD_GROUPS = new Set(['housekeeping', 'laundry'])
const fieldPhotoUpload = createImageUpload('housekeeping').array('photos', 3)
export const BLOCK_DENIED = { error: 'Bu blok size atanmamış' }

export function requireFieldGroup(req, res, next) {
  const worker = getDB().prepare(`
    SELECT s.id, s.full_name, s.assigned_block, d.name AS department_name
    FROM staff s
    LEFT JOIN departments d ON d.id=s.department_id
    WHERE s.id=? AND s.is_active=1
  `).get(req.user.workerId)
  const group = worker ? avsRoleGroup(worker.department_name) : null
  if (!FIELD_GROUPS.has(group)) return res.status(403).json({ error: 'Bu ekran kat hizmetleri ve çamaşırhane içindir' })
  req.fieldWorker = { id: worker.id, full_name: worker.full_name, group, assigned_block: worker.assigned_block || null }
  next()
}

avsBoardRouter.use(requireAvsKiosk, requireFieldGroup)

// Bloğa atanmış personel yalnız kendi bloğunu görür ve işaretler (atama yoksa kısıt yok) — çamaşır defteri de kullanır
export const blockAllowed = (req, block) => !req.fieldWorker.assigned_block || req.fieldWorker.assigned_block === block
const blockOf = location => String(location).split('-')[0]

function acceptFieldPhotos(req, res, next) {
  fieldPhotoUpload(req, res, err => {
    if (!err) return next()
    removeUploadedFiles(req)
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fotoğraf başına en fazla 10 MB yüklenebilir'
      : err.code === 'LIMIT_UNEXPECTED_FILE' ? 'En fazla 3 fotoğraf yüklenebilir'
        : err.message || 'Fotoğraf yüklenemedi'
    return res.status(400).json({ error: message })
  })
}

avsBoardRouter.get('/blocks', (req, res, next) => {
  try {
    const assigned = req.fieldWorker.assigned_block
    const blocks = boardBlocks()
    res.json({ blocks: assigned ? blocks.filter(b => b.block === assigned) : blocks, assigned_block: assigned })
  } catch (e) { next(e) }
})

avsBoardRouter.get('/rooms', (req, res, next) => {
  try {
    const block = String(req.query.block || '').trim()
    if (!blockAllowed(req, block)) return res.status(403).json(BLOCK_DENIED)
    const board = boardRooms(block, { workerId: req.fieldWorker.id })
    if (!board) return res.status(404).json({ error: 'Blok bulunamadı' })
    res.json(board)
  } catch (e) { next(e) }
})

avsBoardRouter.post('/mark', acceptFieldPhotos, verifyImageMagicBytes, validateUploadBody(fieldMarkSchema), (req, res, next) => {
  try {
    const { location, action, reason, note, scan_id: scanId } = req.validated
    if (!blockAllowed(req, blockOf(location))) {
      removeUploadedFiles(req)
      return res.status(403).json(BLOCK_DENIED)
    }
    const photoUrls = uploadedFiles(req).map(file => `/uploads/${file.filename}`)
    const result = markField({ location, action, reason, note, workerId: req.fieldWorker.id, photoUrls, scanId })
    if (result.already) removeUploadedFiles(req) // ilk temizleyenin kaydı korunur; yeni dosya bağlanmaz
    res.json(result)
  } catch (e) {
    removeUploadedFiles(req)
    next(e)
  }
})

avsBoardRouter.post('/undo', validate(fieldLocationSchema), (req, res, next) => {
  try {
    const { location } = req.validated
    if (!blockAllowed(req, blockOf(location))) return res.status(403).json(BLOCK_DENIED)
    res.json(undoField({ location, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})

avsBoardRouter.patch('/rooms/:id/occupancy', validate(fieldOccupancySchema), (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const room = getDB().prepare('SELECT block FROM rooms WHERE id=?').get(id)
    if (room && !blockAllowed(req, room.block)) return res.status(403).json(BLOCK_DENIED)
    res.json(setOccupancy(id, req.validated.occupancy, { workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})

avsBoardRouter.post('/floor', validate(fieldFloorSchema), (req, res, next) => {
  try {
    const { block, floor, dry_run: dryRun } = req.validated
    if (!blockAllowed(req, block)) return res.status(403).json(BLOCK_DENIED)
    res.json(cleanFloor({ block, floor, workerId: req.fieldWorker.id, dryRun }))
  } catch (e) { next(e) }
})

// Etiket kurulumu: görevli panoda açtığı yerin kapısındaki etiketi okutur; yanlış kapı / iptal etiket kaydedilir
avsBoardRouter.post('/label-verify', validate(fieldLabelVerifySchema), (req, res, next) => {
  try {
    const { location, qr } = req.validated
    if (!blockAllowed(req, blockOf(location))) return res.status(403).json(BLOCK_DENIED)
    res.json(verifyFieldLabel({ location, qr, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})

avsBoardRouter.post('/floor-undo', validate(fieldFloorUndoSchema), (req, res, next) => {
  try {
    const { locations } = req.validated
    if (locations.some(location => !blockAllowed(req, blockOf(location)))) return res.status(403).json(BLOCK_DENIED)
    res.json(undoFloor({ locations, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})
