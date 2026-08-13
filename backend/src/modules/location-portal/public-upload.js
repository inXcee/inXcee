import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import multer from 'multer'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const uploadDir = process.env.UPLOADS_DIR || 'uploads'
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 3 },
  fileFilter: (_req, file, callback) => {
    callback(ALLOWED_MIME.has(file.mimetype) ? null : new Error('Sadece JPEG, PNG veya WebP fotoğraf yüklenebilir'), ALLOWED_MIME.has(file.mimetype))
  },
})

export function receivePortalFaultPhotos(req, res, next) {
  upload.array('photos', 3)(req, res, error => {
    if (!error) return next()
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Her fotoğraf en fazla 10 MB olabilir'
      : error.code === 'LIMIT_FILE_COUNT'
        ? 'En fazla 3 fotoğraf yüklenebilir'
        : error.message
    return res.status(400).json({ error: message, code: 'invalid_photo' })
  })
}

export async function verifyPortalFaultPhotos(req, res, next) {
  try {
    for (const file of req.files || []) {
      const detected = await fileTypeFromBuffer(file.buffer)
      if (!detected || !ALLOWED_MIME.has(detected.mime)) {
        return res.status(400).json({
          error: 'Fotoğraf formatı doğrulanamadı. Yalnız gerçek JPEG, PNG veya WebP kabul edilir.',
          code: 'invalid_photo_content',
        })
      }
    }
    next()
  } catch (error) { next(error) }
}

export async function encodePortalFaultPhotos(req, res, next) {
  const written = []
  try {
    for (const file of req.files || []) {
      const filename = `room-portal-fault-${Date.now()}-${randomBytes(8).toString('hex')}.jpg`
      const target = path.join(uploadDir, filename)
      await sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 84, chromaSubsampling: '4:4:4' })
        .toFile(target)
      written.push(`/uploads/${filename}`)
    }
    req.portalImageUrls = written
    next()
  } catch {
    cleanupPortalImages(written)
    return res.status(400).json({
      error: 'Fotoğraf okunamadı veya bozuk. Lütfen farklı bir fotoğraf seçin.',
      code: 'invalid_photo_content',
    })
  }
}

export function cleanupPortalImages(urls = []) {
  for (const url of urls) {
    const filename = path.basename(String(url))
    if (!filename.startsWith('room-portal-fault-')) continue
    try { fs.unlinkSync(path.join(uploadDir, filename)) } catch { /* already removed */ }
  }
}
