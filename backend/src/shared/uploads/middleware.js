import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'

const uploadDir = process.env.UPLOADS_DIR || 'uploads'
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

function createStorage(prefix = '') {
  const safePrefix = String(prefix).replace(/[^a-z0-9-]/gi, '').replace(/-+$/, '')
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
      cb(null, `${safePrefix ? `${safePrefix}-` : ''}${unique}${path.extname(file.originalname)}`)
    }
  })
}

const storage = createStorage()

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DOCUMENT_MIME = new Set([...ALLOWED_MIME, 'application/pdf'])

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Sadece resim dosyalari yuklenebilir (JPEG, PNG, WebP)'))
  }
}

export const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter })

export function createImageUpload(prefix) {
  return multer({ storage: createStorage(prefix), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter })
}

function documentFileFilter(req, file, cb) {
  if (DOCUMENT_MIME.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Sadece JPEG, PNG, WebP veya PDF dosyasi yuklenebilir'))
  }
}

export const documentUpload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: documentFileFilter })

/**
 * Magic bytes doğrulama middleware — multer'dan sonra kullanılır
 * Dosyanın gerçek formatını MIME tipine göre doğrular
 */
export async function verifyMagicBytes(req, res, next) {
  if (!req.file) return next()
  try {
    const buffer = fs.readFileSync(req.file.path)
    const detected = await fileTypeFromBuffer(buffer)
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ error: 'Dosya formatı doğrulanamadı. Sadece gerçek JPEG/PNG/WebP kabul edilir.' })
    }
    next()
  } catch (e) {
    try { fs.unlinkSync(req.file.path) } catch { /* ignore */ }
    next(e)
  }
}

export async function verifyDocumentMagicBytes(req, res, next) {
  const files = req.files ? Object.values(req.files).flat() : (req.file ? [req.file] : [])
  if (!files.length) return next()
  try {
    for (const file of files) {
      const buffer = fs.readFileSync(file.path)
      const detected = await fileTypeFromBuffer(buffer)
      if (!detected || !DOCUMENT_MIME.has(detected.mime)) {
        files.forEach(item => { try { fs.unlinkSync(item.path) } catch { /* ignore */ } })
        return res.status(400).json({ error: 'Dosya formati dogrulanamadi. Sadece gercek JPEG/PNG/WebP/PDF kabul edilir.' })
      }
    }
    next()
  } catch (e) {
    files.forEach(file => { try { fs.unlinkSync(file.path) } catch { /* ignore */ } })
    next(e)
  }
}
