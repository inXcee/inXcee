import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'

const uploadDir = 'uploads'
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir)

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Sadece resim dosyalari yuklenebilir (JPEG, PNG, WebP)'))
  }
}

export const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter })

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
