import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'

const docDir = process.env.DOCUMENTS_DIR || path.join(process.env.UPLOADS_DIR || 'uploads', 'documents')
if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, docDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname || ''))
  }
})

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME.has(file.mimetype)) cb(null, true)
  else cb(new Error('Sadece PDF, resim ve Office dosyalari yuklenebilir'))
}

export const documentUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter,
})

// PDF + Office mime'larini magic-byte ile dogrulamak guvenilir degil; sadece image icin ek check
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function verifyDocumentBytes(req, res, next) {
  if (!req.file) return next()
  try {
    if (IMAGE_MIME.has(req.file.mimetype)) {
      const buffer = fs.readFileSync(req.file.path)
      const detected = await fileTypeFromBuffer(buffer)
      if (!detected || !IMAGE_MIME.has(detected.mime)) {
        fs.unlinkSync(req.file.path)
        return res.status(400).json({ error: 'Dosya format dogrulanamadi' })
      }
    }
    next()
  } catch (e) {
    try { fs.unlinkSync(req.file.path) } catch {}
    next(e)
  }
}
